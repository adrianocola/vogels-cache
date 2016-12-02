const _ = require('lodash');
const async = require('async');
const SEP = ':';

function JSONfromCache(string){
    try{
        return JSON.parse(string);
    }catch(e){
        throw e;
    }
}

function clearCacheOptions(options){
    //don't mess with dynamo parameters
    delete options.CACHE_RESULT;
    delete options.CACHE_SKIP;
    delete options.CACHE_EXPIRE;
    return options;
}

const VogelsCache = module.exports = function(redis){

    this.redis = redis;

};

VogelsCache.setRedisClient = function(redis){
    this.redis = redis;
};

VogelsCache.prepare = function(schema,config){

    config = _.merge(config || {},{
            CACHE_RESULT: true,
            CACHE_SKIP: false,
            CACHE_EXPIRE: undefined
        });

    let redis = config.redis || this.redis;

    //Vogels don't expose the schema definition to the Model, so we need to
    // create a sample model to get the schema configuration.
    let sample = new schema();
    let table = sample.table;
    let originalTableInitItem = table.initItem;
    let hashKey = sample.table.schema.hashKey;
    let rangeKey = sample.table.schema.rangeKey;

    let getCacheKey = function(hash,range){
        return schema.tableName() + SEP + hash + (typeof range === 'string'?SEP + range:'')
    };

    let getModelCacheKey = function(model){
        return getCacheKey(model.get(hashKey),model.get(rangeKey));
    };

    let cacheModel = function(model,expire,cb){

        if(typeof expire === 'function'){
            cb = expire;
            expire = null;
        }

        //mark the model as cached
        model.cached = new Date();
        let cachedKey = getModelCacheKey(model);
        let multi = redis.multi();
        multi.set(cachedKey,JSON.stringify(model.toJSON()));
        if(expire){
            multi.expire(cachedKey, expire);
        }
        multi.exec(cb);
    };

    let prepareItem = function(item){
        item.save = function(callback){
            CachedSchema.create(this.attrs,function (err, createdItem) {
                if(err) {
                    return callback(err);
                }

                item.set(createdItem.attrs);
                item.cached = createdItem.cached;

                return callback(null, createdItem);
            });
        };

        item.update = function(options,callback){

            if (typeof options === 'function' && !callback) {
                callback = options;
                options = {};
            }

            options = options || {};
            callback = callback || _.noop;

            CachedSchema.update(this.attrs,options,function (err, updatedItem) {
                if(err) {
                    return callback(err);
                }

                item.set(updatedItem.attrs);
                item.cached = updatedItem.cached;

                return callback(null, updatedItem);
            });
        };

        item.destroy = function(options,callback){
            CachedSchema.destroy(this.attrs[hashKey],this.attrs[rangeKey],options,callback);
        };

        item.uncache = function(callback){
            CachedSchema.uncache(this.attrs[hashKey],this.attrs[rangeKey],callback);
        };
        return item;
    };

    let cachedExec = function(haveExec){

        let originalExec = haveExec.exec;

        let cacheResult = false;
        let cacheExpire = config.CACHE_EXPIRE;

        haveExec.cacheResults = function(shouldCache,expire){
            cacheResult = shouldCache === true;
            if(typeof expire === 'number'){
                cacheExpire = expire;
            }
            return this;
        };

        haveExec.exec = function(callback){
            callback = callback || function(){};
            originalExec.call(haveExec,function(err,response){
                if(!err && cacheResult){
                    _.each(response.Items,function(model) {
                        cacheModel(model,cacheExpire);
                    });
                }
                callback(err,response);
            });
        };

        return haveExec;

    };

    const getCacheOptions = function(options){
        return {
            CACHE_RESULT: _.isNil(options.CACHE_RESULT)?config.CACHE_RESULT:options.CACHE_RESULT,
            CACHE_SKIP: _.isNil(options.CACHE_SKIP)?config.CACHE_SKIP:options.CACHE_SKIP,
            CACHE_EXPIRE: _.isNil(options.CACHE_EXPIRE)?config.CACHE_EXPIRE:options.CACHE_EXPIRE
        };
    };

    //wrap default item creation to add cache methods
    table.initItem = function(){

        let item = originalTableInitItem.apply(table,arguments);

        return prepareItem(item);

    };

    //save original schema methods
    let originalGet = schema.get;
    let originalCreate = schema.create;
    let originalUpdate = schema.update;
    let originalDestroy = schema.destroy;
    let originalQuery = schema.query;
    let originalScan = schema.scan;
    let originalParallelScan = schema.parallelScan;
    let originalGetItems = schema.getItems;

    //wrapped item contructor
    let CachedSchema = function(attr){
        let item = new schema(attr);

        return prepareItem(item);
    };

    CachedSchema = _.assignIn(CachedSchema, schema);

    CachedSchema.get = function(hashKey, rangeKey, options, callback){

        if (_.isPlainObject(rangeKey) && typeof options === 'function' && !callback) {
            callback = options;
            options = rangeKey;
            rangeKey = null;
        } else if (typeof rangeKey === 'function' && !callback) {
            callback = rangeKey;
            options = {};
            rangeKey = null;
        } else if (typeof options === 'function' && !callback) {
            callback = options;
            options = {};
        }

        let cacheOptions = getCacheOptions(options);

        let doOriginal = function(){
            clearCacheOptions(options);

            originalGet.apply(schema,[hashKey,rangeKey,options,function(err,model){
                if(cacheOptions.CACHE_RESULT && model){
                    cacheModel(model,cacheOptions.CACHE_EXPIRE);
                }
                callback(err,model)
            }])
        };

        if(cacheOptions.CACHE_SKIP) return doOriginal();

        let cacheKey = getCacheKey(hashKey,rangeKey);

        redis.get(cacheKey,function(err,resp){
            if(resp){
                let item = new CachedSchema(JSONfromCache(resp));
                item.fromCache = new Date();
                return callback(null,item)
            }

            doOriginal();

        });

    };
    CachedSchema.create = function(attrs,options,callback){

        if (typeof options === 'function' && !callback) {
            callback = options;
            options = {};
        }

        callback = callback || _.noop;
        options = options || {};

        let cacheOptions = getCacheOptions(options);

        clearCacheOptions(options);

        originalCreate.apply(schema,[attrs,options,function(err,model){

            if(!err && cacheOptions.CACHE_RESULT){
                if (_.isArray(model)) {
                    async.each(model,function(m,cb){
                        cacheModel(m,cacheOptions.CACHE_EXPIRE,cb);
                    });
                }else{
                    cacheModel(model,cacheOptions.CACHE_EXPIRE);
                }
            }

            callback(err,model);

        }]);

    };
    CachedSchema.update = function(item, options, callback){

        if (typeof options === 'function' && !callback) {
            callback = options;
            options = {};
        }

        callback = callback || _.noop;
        options = options || {};

        let cacheOptions = getCacheOptions(options);

        //the default behavior for update is to NOT CACHE (even if CACHE_RESULT is setted at models creation)
        //only the option CACHE_RESULT can override that
        cacheOptions.CACHE_RESULT = options.CACHE_RESULT;


        clearCacheOptions(options);

        originalUpdate.apply(schema,[item,options,function(err,model){

            if(!err){
                if(cacheOptions.CACHE_RESULT){
                    cacheModel(model,cacheOptions.CACHE_EXPIRE);
                }else{
                    let cacheKey;
                    if(rangeKey){
                        cacheKey = getCacheKey(item[hashKey],item[rangeKey]);
                    }else{
                        cacheKey = getCacheKey(item[hashKey]);
                    }
                    redis.del(cacheKey);
                }

            }

            callback(err,model);

        }]);

    };
    CachedSchema.destroy = function(hashKey, rangeKey, options, callback){

        if (_.isPlainObject(rangeKey) && typeof options === 'function' && !callback) {
            callback = options;
            options = rangeKey;
            rangeKey = null;
        } else if (typeof rangeKey === 'function' && !callback) {
            callback = rangeKey;
            options = {};
            rangeKey = null;
        } else if (_.isPlainObject(rangeKey) && !callback) {
            callback = options;
            options = rangeKey;
            rangeKey = null;
        } else if (typeof options === 'function' && !callback) {
            callback = options;
            options = {};
        }

        callback = callback || _.noop;
        options = options || {};

        originalDestroy.apply(schema,[hashKey,rangeKey,options,function(err,model){

            let cacheKey = getCacheKey(hashKey,rangeKey);
            redis.del(cacheKey);

            callback(err,model);

        }])
    };
    CachedSchema.query = function(hashKey){
        let query = originalQuery.apply(schema,arguments);
        return cachedExec(query);
    };
    CachedSchema.scan = function(hashKey){
        let scan = originalScan.apply(schema,arguments);
        return cachedExec(scan);
    };
    CachedSchema.parallelScan = function(hashKey){
        let parallelScan = originalParallelScan.apply(schema,arguments);
        return cachedExec(parallelScan);
    };

    CachedSchema.getItems = CachedSchema.batchGetItems = function(items,options,callback){

        if(typeof options === 'function'){
            callback = options;
            options = {};
        }

        let cacheOptions = getCacheOptions(options);

        let results = [];
        let missing = [];
        let positionMap = {};
        let indexCount = 0;

        let doOriginal = function(fetchItems){

            clearCacheOptions(options);

            originalGetItems.apply(schema,[fetchItems,options,function(err,models){

                if(!cacheOptions.CACHE_RESULT && cacheOptions.CACHE_SKIP){
                    return callback(err,models);
                }

                _.each(models,function(model){
                    if(cacheOptions.CACHE_RESULT){
                        cacheModel(model,cacheOptions.CACHE_EXPIRE);
                    }

                    if(!cacheOptions.CACHE_SKIP){
                        let cacheKey = getModelCacheKey(model);
                        results[positionMap[cacheKey]] = model;
                    }

                });

                if(cacheOptions.CACHE_SKIP){
                    return callback(err,models);
                }else{
                    return callback(null,_.compact(results));
                }

            }])
        };

        if(cacheOptions.CACHE_SKIP) return doOriginal(items);

        //try to get each item in cache in parallel
        async.each(items,function(value,cb){
            let cacheKey
            if(typeof value === 'string'){
                cacheKey = getCacheKey(value);
            }else{
                cacheKey = getCacheKey(value[hashKey],value[rangeKey]);
            }

            positionMap[cacheKey] = indexCount;
            indexCount = indexCount + 1;

            redis.get(cacheKey,function(err,resp){
                if(err || !resp){
                    missing.push(value);
                }else{
                    let item = new CachedSchema(JSONfromCache(resp));
                    item.fromCache = new Date();
                    results[positionMap[cacheKey]] = item;
                }
                cb();
            })

        },function(){

            if(missing.length === 0){
                return callback(null,_.compact(results));
            }

            doOriginal(missing);

        });

    };

    //removes the model from cache only
    CachedSchema.uncache = function(hashKey, rangeKey, callback){

        if (typeof rangeKey === 'function' && !callback) {
            callback = rangeKey;
            rangeKey = null;
        }

        let cacheKey = getCacheKey(hashKey,rangeKey);
        redis.del(cacheKey,callback);

    };

    return CachedSchema;

};
