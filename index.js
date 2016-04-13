var _ = require('lodash');
var async = require('async');
const SEP = ':';

function cacheableJSON(model){
    var json = model.toJSON();
    for (var key in json) {
        var value = json[key];
        if(typeof value === 'object'){
            json[key] = '!' +  JSON.stringify(value);
        }
    }
    return json;
}

function JSONfromCache(json){
    for (var key in json) {
        var value = json[key];
        if(typeof value === 'string' && _.startsWith(value,'!{')){
            try{
                json[key] = JSON.parse(value.substring(1));
            }catch(e){}
        }
    }
    return json;
}

function clearCacheOptions(options){
    //don't mess with dynamo parameters
    delete options.CACHE_RESULT;
    delete options.CACHE_SKIP;
    delete options.CACHE_EXPIRE;
    return options;
}

var VogelsCache = module.exports = function(redis){

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

    var redis = config.redis || this.redis;

    //Vogels don't expose the schema definition to the Model, so we need to
    // create a sample model to get the schema configuration.
    var sample = new schema();
    var table = sample.table;
    var originalTableInitItem = table.initItem;
    var hashKey = sample.table.schema.hashKey;
    var rangeKey = sample.table.schema.rangeKey;

    var getCacheKey = function(hash,range){
        return schema.tableName() + SEP + hash + (typeof range === 'string'?SEP + range:'')
    };

    var getModelCacheKey = function(model){
        return getCacheKey(model.get(hashKey),model.get(rangeKey));
    };

    var cacheModel = function(model,expire,cb){

        if(typeof expire === 'function'){
            cb = expire;
            expire = null;
        }

        //mark the model as cached
        model.cached = new Date();
        var cachedKey = getModelCacheKey(model);
        var multi = redis.multi();
        multi.hmset(cachedKey,cacheableJSON(model));
        if(expire){
            multi.expire(cachedKey, expire);
        }
        multi.exec(cb);
    };

    var prepareItem = function(item){
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
        return item;
    };

    var cachedExec = function(haveExec){

        var originalExec = haveExec.exec;

        var cacheResult = config.CACHE_RESULT;
        var cacheExpire = config.CACHE_EXPIRE;

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

    var getCacheOptions = function(options){
        return {
            CACHE_RESULT: _.isNil(options.CACHE_RESULT)?config.CACHE_RESULT:options.CACHE_RESULT,
            CACHE_SKIP: _.isNil(options.CACHE_SKIP)?config.CACHE_SKIP:options.CACHE_SKIP,
            CACHE_EXPIRE: _.isNil(options.CACHE_EXPIRE)?config.CACHE_EXPIRE:options.CACHE_EXPIRE
        };
    };

    //wrap default item creation to add cache methods
    table.initItem = function(){

        var item = originalTableInitItem.apply(table,arguments);

        return prepareItem(item);

    };

    //save original schema methods
    var originalGet = schema.get;
    var originalCreate = schema.create;
    var originalUpdate = schema.update;
    var originalDestroy = schema.destroy;
    var originalQuery = schema.query;
    var originalScan = schema.scan;
    var originalParallelScan = schema.parallelScan;
    var originalGetItems = schema.getItems;

    //wrapped item contructor
    var CachedSchema = function(attr){
        var item = new schema(attr);

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

        var cacheOptions = getCacheOptions(options);

        var doOriginal = function(){
            clearCacheOptions(options);

            originalGet.apply(schema,[hashKey,rangeKey,options,function(err,model){
                if(cacheOptions.CACHE_RESULT && model){
                    cacheModel(model,cacheOptions.CACHE_EXPIRE);
                }
                callback(err,model)
            }])
        };

        if(cacheOptions.CACHE_SKIP) return doOriginal();

        var cacheKey = getCacheKey(hashKey,rangeKey);

        redis.hgetall(cacheKey,function(err,resp){
            if(resp){
                var item = new CachedSchema(JSONfromCache(resp));
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

        var cacheOptions = getCacheOptions(options);

        clearCacheOptions(options);

        originalCreate.apply(schema,[attrs,options,function(err,model){

            if(!err && cacheOptions.CACHE_RESULT){
                cacheModel(model,cacheOptions.CACHE_EXPIRE);
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

        var cacheOptions = getCacheOptions(options);

        clearCacheOptions(options);

        originalUpdate.apply(schema,[item,options,function(err,model){

            if(!err && cacheOptions.CACHE_RESULT){
                cacheModel(model,cacheOptions.CACHE_EXPIRE);
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

        originalDestroy.apply(schema,[hashKey,rangeKey,options,function(err,model){

            var cacheKey = getCacheKey(hashKey,rangeKey);
            redis.del(cacheKey);

            callback(err,model);

        }])
    };
    CachedSchema.query = function(hashKey){
        var query = originalQuery.apply(schema,arguments);
        return cachedExec(query);
    };
    CachedSchema.scan = function(hashKey){
        var scan = originalScan.apply(schema,arguments);
        return cachedExec(scan);
    };
    CachedSchema.parallelScan = function(hashKey){
        var parallelScan = originalParallelScan.apply(schema,arguments);
        return cachedExec(parallelScan);
    };

    CachedSchema.getItems = CachedSchema.batchGetItems = function(items,options,callback){

        if(typeof options === 'function'){
            callback = options;
            options = {};
        }

        var cacheOptions = getCacheOptions(options);

        var fetched = [];
        var missing = [];

        var doOriginal = function(fetchItems){

            clearCacheOptions(options);

            originalGetItems.apply(schema,[fetchItems,options,function(err,models){

                if(!cacheOptions.CACHE_RESULT && cacheOptions.CACHE_SKIP){
                    return callback(err,models);
                }

                var lastMissing = 0;
                _.each(models,function(model){
                    if(cacheOptions.CACHE_RESULT){
                        cacheModel(model,cacheOptions.CACHE_EXPIRE);
                    }

                    //fill the placeholders with actual models
                    if(!cacheOptions.CACHE_SKIP){
                        if(lastMissing < fetched.length){
                            for(var j=lastMissing;j<fetched.length;j++){
                                lastMissing = j+1;
                                if(fetched[j] === SEP){
                                    fetched[j] = model;
                                    break;
                                }
                            }
                        }else{
                            fetched.push(model);
                        }
                    }else{
                        fetched.push(model);
                    }

                });
                callback(err,_.without(fetched,SEP));

            }])
        };

        if(cacheOptions.CACHE_SKIP) return doOriginal(items);

        async.eachSeries(items,function(value,cb){
            var cacheKey;
            if(typeof value === 'string'){
                cacheKey = getCacheKey(value);
            }else{
                cacheKey = getCacheKey(value[hashKey],value[rangeKey]);
            }

            redis.hgetall(cacheKey,function(err,resp){
                if(err || !resp){
                    missing.push(value);
                    //leaves a placeholder that can be filled by dynamodb later
                    fetched.push(SEP);
                }else{
                    var item = new CachedSchema(JSONfromCache(resp));
                    item.fromCache = new Date();
                    fetched.push(item);
                }
                cb();
            })

        },function(){

            if(!missing.length){
                return callback(null,fetched);
            }

            doOriginal(missing);

        });

    };

    return CachedSchema;

};
