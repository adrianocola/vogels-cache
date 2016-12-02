var should = require('should');
var Vogels = require('vogels');
var Dynogels = require('dynogels');
var async = require('async');
var Joi = require('joi');

class Tester{
    constructor(engine,done) {
        this.redis = require("fakeredis").createClient();

        this.Cache = require('../index.js');
        this.Cache.setRedisClient(this.redis);

        var dynamoPort = engine==='vogels'?4567:4568;

        require('local-dynamo').launch({
            port: dynamoPort,
            sharedDb: true,
            heap: '512m'
        });
        Vogels.AWS.config.update({endpoint: 'http://localhost:'+dynamoPort, region: 'REGION', accessKeyId: 'abc', secretAccessKey: '123'});

        this.Foo = Vogels.define('foo', {
            tableName: 'foo',
            hashKey : 'username',
            schema : {
                username: Joi.string(),
                data: Joi.string(),
                number: Joi.number().integer(),
                boolean: Joi.boolean(),
                date: Joi.date(),
                set   : Vogels.types.stringSet()
            }
        });

        this.Bar = Vogels.define('bar', {
            tableName: 'bar',
            hashKey : 'username',
            rangeKey: 'message',
            schema : {
                username: Joi.string(),
                message: Joi.string(),
                data: Joi.string(),
                settings : {
                    mood: Joi.string(),
                    free: Joi.boolean().default(false)
                }
            },
            indexes: [
                {   //index used to get users that received the package with this packid
                    hashKey : 'message',
                    rangeKey : 'username',
                    name : 'include',
                    type : 'global',
                    projection: { NonKeyAttributes: [ 'data' ], ProjectionType: 'INCLUDE' }
                }
            ]
        });

        Vogels.createTables(done);
    }

    createFoo(username,cache,cb){
        if(cache){
            var CacheableFoo = this.Cache.prepare(this.Foo);
            CacheableFoo.create({
                username: username,
                data: username
            },cb);
        }else{
            this.Foo.create({
                username: username,
                data: username
            },cb);
        }
    }

    createBar(username,message,cache,cb){
        if(cache){
            var CacheableBar = this.Cache.prepare(this.Bar);
            CacheableBar.create({
                username: username,
                message: message,
                data: message
            },cb);
        }else{
            this.Bar.create({
                username: username,
                message: message,
                data: message
            },cb);
        }
    }

    createBars(username,messages,cache,cb){
        async.each(messages, (message,cb) => {
            this.createBar(username,message,cache,cb);
        },cb);
    }

    MODEL_GET_shouldGetFromCacheByDefault(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'model-get-1';

        this.createFoo(key,true,() => {
            CacheableFoo.get(key,(err,foo) => {

                should.not.exist(err);
                should.not.exist(foo.cached);
                foo.fromCache.should.be.ok;
                done();

            });
        });

    }

    MODEL_GET_shouldTryToGetGromCacheFirstButFallbackToDynamoDBByDefault(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'model-get-2';

        this.createFoo(key,false,() => {
            CacheableFoo.get(key,(err,foo) => {

                should.not.exist(err);
                foo.cached.should.be.ok;
                should.not.exist(foo.fromCache);
                done();

            });
        });

    }

    MODEL_GET_shouldNotGetFromCacheIfCACHE_SKIPTrueIsSet(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'model-get-3';

        this.createFoo(key,true,() => {
            CacheableFoo.get(key,{CACHE_SKIP:true},(err,foo) => {

                should.not.exist(err);
                foo.cached.should.be.ok;
                should.not.exist(foo.fromCache);
                done();

            });
        });

    }

    MODEL_GET_shouldNotSaveToCacheIfCACHE_RESULTFalse(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'model-get-5';

        this.createFoo(key,false,() => {
            CacheableFoo.get(key,{CACHE_SKIP:true,CACHE_RESULT:false},(err,foo) => {

                should.not.exist(err);
                should.not.exist(foo.cached);
                should.not.exist(foo.fromCache);

                this.redis.exists('foo:'+key,(err,exist) => {
                    should.not.exist(err);
                    exist.should.be.equal(0);
                    done();
                });

            });
        });

    }

    MODEL_CREATE_shouldCacheByDefault(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'model-create-1';

        var foo = CacheableFoo.create({
            username: key,
            data: 'bar'
        },(err) => {

            should.not.exist(err);

            this.redis.exists('foo:'+key,(err,exist) => {
                should.not.exist(err);
                exist.should.be.equal(1);
                done();
            })

        });

    }

    MODEL_CREATE_shouldCacheCreationOfMultipleItems(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key1 = 'model-create-2-1';
        var key2 = 'model-create-2-2';

        var foo = CacheableFoo.create([
            {
                username: key1,
                data: 'bar'
            },
            {
                username: key2,
                data: 'bar'
            }
        ],(err) => {

            should.not.exist(err);

            this.redis.exists('foo:'+key1,(err,exist) => {
                should.not.exist(err);
                exist.should.be.equal(1);

                this.redis.exists('foo:'+key2,(err,exist) => {
                    should.not.exist(err);
                    exist.should.be.equal(1);
                    done();
                })

            })

        });

    }

    MODEL_CREATE_shouldNOTCacheIfCACHE_RESULTFalsePassedAsOption(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'model-create-3';

        var foo = CacheableFoo.create({
            username: key,
            data: 'bar'
        },{CACHE_RESULT: false},() => {

            this.redis.exists('foo:'+key,(err,exist) => {
                should.not.exist(err);
                exist.should.be.equal(0);
                done();
            })

        });

    }

    MODEL_CREATE_shouldSetCacheExpireIfCacheExpirePassedAsOption(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'model-create-4';
        var expire = 10;

        var foo = CacheableFoo.create({
            username: key,
            data: 'bar'
        },{CACHE_EXPIRE: expire},() => {

            this.redis.ttl('foo:'+key,(err,ttl) => {
                should.not.exist(err);
                ttl.should.be.equal(expire);
                done();
            })

        });

    }


    MODEL_UPDATE_shouldNotCacheAndDeleteFromCacheAfterUpdate(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'model-update-1';

        this.createFoo(key,true,() => {

            this.redis.exists('foo:'+key,(err,exist) => {
                should.not.exist(err);
                exist.should.be.equal(1);

                CacheableFoo.update({username: key,data:'updated'},(err,foo) => {

                    should.not.exist(err);
                    should.not.exist(foo.cached);
                    should.not.exist(foo.fromCache);

                    this.redis.exists('foo:'+key,(err,exist) => {
                        should.not.exist(err);
                        exist.should.be.equal(0);
                        done();
                    });

                });

            });

        });

    }

    MODEL_UPDATE_shouldCacheIfPassedOptionCacheResultTrue(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'model-update-2';

        this.createFoo(key,true,() => {

            this.redis.get('foo:'+key,(err,redisItem) => {
                should.not.exist(err);
                var parseItem = JSON.parse(redisItem);
                parseItem.data.should.be.equal(key);

                CacheableFoo.update({username: key,data:'updated'},{CACHE_RESULT: true},(err,foo) => {

                    should.not.exist(err);
                    foo.cached.should.be.ok;
                    should.not.exist(foo.fromCache);

                    this.redis.get('foo:'+key,(err,redisItem) => {
                        should.not.exist(err);
                        var parseItem = JSON.parse(redisItem);
                        parseItem.data.should.be.equal('updated');
                        done();
                    });

                });

            });

        });

    }

    MODEL_DESTROY_shouldAlsoRemoveFromCache(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'model-destroy-1';

        this.createFoo(key,true,() => {
            CacheableFoo.destroy(key,(err) => {

                should.not.exist(err);

                this.redis.exists('foo:'+key,(err,exist) => {
                    should.not.exist(err);
                    exist.should.be.equal(0);
                    done();
                });

            });
        });

    }

    MODEL_QUERY_shouldNotCacheByDefault(done){

        var CacheableBar = this.Cache.prepare(this.Bar);
        var key = 'model-query-1';

        this.createBars(key,['a','b'],false,() => {
            CacheableBar.query(key).exec((err,bars) => {

                should.not.exist(err);

                var b0 = bars.Items[0];
                should.not.exist(b0.cached);
                should.not.exist(b0.fromCache);

                var b1 = bars.Items[1];
                should.not.exist(b1.cached);
                should.not.exist(b1.fromCache);

                done();

            });
        });

    }

    MODEL_QUERY_shouldCacheIfCalledCacheResultsTrueInQuery(done){

        var CacheableBar = this.Cache.prepare(this.Bar);
        var key = 'model-query-2';

        this.createBars(key,['a','b'],false,() => {
            CacheableBar.query(key).cacheResults(true).exec((err,bars) => {

                should.not.exist(err);

                var b0 = bars.Items[0];
                b0.cached.should.be.ok;
                should.not.exist(b0.fromCache);

                var b1 = bars.Items[1];
                b1.cached.should.be.ok;
                should.not.exist(b1.fromCache);

                done();

            });
        });

    }

    MODEL_UNCACHE_shouldCacheNewModel(done){

        var key = 'model-uncache-1';
        var CacheableFoo = this.Cache.prepare(this.Foo);

        var foo = CacheableFoo.create({
            username: key,
            data: 'bar'
        },(err) => {

            should.not.exist(err);

            this.redis.exists('foo:'+key,(err,exist) => {
                should.not.exist(err);
                exist.should.be.equal(1);

                CacheableFoo.uncache(key,(err) => {

                    should.not.exist(err);

                    this.redis.exists('foo:'+key,(err,exist) => {
                        should.not.exist(err);
                        exist.should.be.equal(0);

                        CacheableFoo.get(key,(err,foo) => {

                            should.not.exist(err);
                            foo.should.be.ok;
                            foo.cached.should.be.ok;
                            should.not.exist(foo.fromCache);

                            done();

                        });

                    });

                });

            });

        });

    }

    MODEL_GETITEMS_shouldCacheByDefault(done){

        var CacheableBar = this.Cache.prepare(this.Bar);
        var key = 'model-getItems-1';
        var items = [
            {username: key, message:'a'},
            {username: key, message:'b'}
        ];

        this.createBars(key,['a','b'],false,() => {
            CacheableBar.getItems(items,(err,bars) => {

                should.not.exist(err);

                var b0 = bars[0];
                b0.cached.should.be.ok;
                should.not.exist(b0.fromCache);

                var b1 = bars[1];
                b1.cached.should.be.ok;
                should.not.exist(b1.fromCache);

                done();

            });
        });

    }

    MODEL_GETITEMS_shouldNotTryToFetchFromDynamoDbIfFoundAllInCache(done){

        var CacheableBar = this.Cache.prepare(this.Bar);
        var key = 'model-getItems-1';
        var items = [
            {username: key, message:'a'},
            {username: key, message:'b'}
        ];

        this.createBars(key,['a','b'],true,() => {
            CacheableBar.getItems(items,(err,bars) => {

                should.not.exist(err);

                var b0 = bars[0];
                should.not.exist(b0.cached);
                b0.fromCache.should.be.ok;

                var b1 = bars[1];
                should.not.exist(b1.cached);
                b1.fromCache.should.be.ok;

                done();

            });
        });

    }

    MODEL_GETITEMS_shouldSearchInCacheAndFallbackToDynamoDbByDefault(done){

        var CacheableBar = this.Cache.prepare(this.Bar);
        var key = 'model-getItems-2';
        var items = [
            {username: key, message:'a'},
            {username: key, message:'c'}, //don't exist
            {username: key, message:'b'},
            {username: key, message:'d'} //don't exist
        ];

        this.createBar(key,'a',false,() => { //a is not cached
            this.createBar(key,'b',true,() => { //b is cached
                CacheableBar.getItems(items,(err,bars) => {

                    should.not.exist(err);

                    bars.length.should.be.equal(2);

                    var b0 = bars[0]; //a not from cache
                    b0.cached.should.be.ok;
                    should.not.exist(b0.fromCache);

                    var b1 = bars[1]; //b from cache
                    should.not.exist(b1.cached);
                    b1.fromCache.should.be.ok;

                    done();

                });
            });
        });

    }

    MODEL_GETITEMS_shouldNotGetFromCacheIfCacheSkipTrueIsSet(done){

        var CacheableBar = this.Cache.prepare(this.Bar);
        var key = 'model-getItems-3';
        var items = [
            {username: key, message:'a'},
            {username: key, message:'b'}
        ];

        this.createBars(key,['a','b'],true,() => { //is in cache
            CacheableBar.getItems(items,{CACHE_SKIP:true},(err,bars) => {

                should.not.exist(err);

                var b0 = bars[0];
                b0.cached.should.be.ok;
                should.not.exist(b0.fromCache);

                var b1 = bars[1];
                b1.cached.should.be.ok;
                should.not.exist(b1.fromCache);

                done();

            });
        });

    }

    MODEL_GETITEMS_shouldNotCacheIfCacheResultFalseIsSet(done){

        var CacheableBar = this.Cache.prepare(this.Bar);
        var key = 'model-getItems-4';
        var items = [
            {username: key, message:'a'},
            {username: key, message:'b'}
        ];

        this.createBars(key,['a','b'],false,() => {
            CacheableBar.getItems(items,{CACHE_RESULT:false},(err,bars) => {

                should.not.exist(err);

                var b0 = bars[0];
                should.not.exist(b0.cached);
                should.not.exist(b0.fromCache);

                var b1 = bars[1];
                should.not.exist(b1.cached);
                should.not.exist(b1.fromCache);

                this.redis.exists('foo:'+key+':a',(err,exist) => {
                    should.not.exist(err);
                    exist.should.be.equal(0);
                    this.redis.exists('foo:'+key+':b',(err,exist) => {
                        should.not.exist(err);
                        exist.should.be.equal(0);
                        done();
                    });
                });

            });
        });

    }

    ITEM_SAVE_shouldCacheByDefault(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'item-save-1';

        var foo = new CacheableFoo({
            username: key,
            data: 'bar'
        });
        foo.save((err) => {

            should.not.exist(err);
            foo.cached.should.be.ok;

            this.redis.exists('foo:'+key,(err,exist) => {
                should.not.exist(err);
                exist.should.be.ok;
                done();
            })

        });

    }

    ITEM_UPDATE_shouldNotCacheAndDeleteFromCacheAfterUpdate(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'item-update-1';

        this.createFoo(key,true,() => {

            this.redis.exists('foo:'+key,(err,exists) => {
                should.not.exist(err);
                exists.should.be.equal(1);

                CacheableFoo.get(key,(err,foo) => {

                    should.not.exist(err);

                    foo.set({data: 'new value'});
                    foo.update((err) => {

                        should.not.exist(err);
                        should.not.exist(foo.cached);

                        this.redis.exists('foo:'+key,(err,exists) => {
                            should.not.exist(err);
                            exists.should.be.equal(0);
                            done();
                        });

                    });

                });

            });


        });

    }

    ITEM_UPDATE_shouldCacheIfPassedOptionCacheResultTrue(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'item-update-1';

        this.createFoo(key,true,() => {

            this.redis.get('foo:'+key,(err,redisItem) => {
                should.not.exist(err);
                var parseItem = JSON.parse(redisItem);
                parseItem.data.should.be.equal(key);

                CacheableFoo.get(key,(err,foo) => {

                    should.not.exist(err);

                    foo.set({data: 'new value'});
                    foo.update({CACHE_RESULT: true},(err) => {

                        should.not.exist(err);
                        foo.cached.should.be.ok;

                        this.redis.get('foo:'+key,(err,redisItem) => {
                            should.not.exist(err);
                            var parseItem = JSON.parse(redisItem);
                            parseItem.data.should.be.equal('new value');
                            done();
                        });

                    });

                });

            });


        });

    }

    ITEM_DESTROY_shouldAlsoRemoveFromCache(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'item-destroy-1';

        this.createFoo(key,true,() => {
            CacheableFoo.get(key,(err,foo) => {

                should.not.exist(err);

                foo.destroy((err) => {

                    should.not.exist(err);

                    this.redis.exists('foo:'+key,(err,exists) => {
                        should.not.exist(err);
                        exists.should.be.equal(0);
                        done();
                    });

                });

            });
        });

    }

    ITEM_UNCACHE_shouldRemoveOnlyFromCache(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'item-uncache-1';

        this.createFoo(key,true,() => {
            CacheableFoo.get(key,(err,foo) => {

                should.not.exist(err);

                foo.uncache((err) => {

                    should.not.exist(err);

                    this.redis.exists('foo:'+key,(err,exists) => {
                        should.not.exist(err);
                        exists.should.be.equal(0);

                        CacheableFoo.get(key,(err,foo) => {

                            should.not.exist(err);
                            foo.should.be.ok;
                            foo.cached.should.be.ok;
                            should.not.exist(foo.fromCache);

                            done();

                        });

                    });

                });

            });
        });

    }

    EXPIRE_shouldCacheExpireIfCacheExpireIsSetted(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'expire-1';

        var foo = CacheableFoo.create({
            username: key,
            data: key
        },{CACHE_EXPIRE:1},(err) => {

            should.not.exist(err);

            this.redis.exists('foo:'+key,(err,exist) => {
                should.not.exist(err);
                exist.should.be.ok; //is in cache
                setTimeout(() => {

                    this.redis.exists('foo:'+key,(err,exist) => {
                        should.not.exist(err);
                        (!exist).should.be.ok; //should not be in cache anymore
                        done();
                    })

                },1000);
            })

        });

    }

    SERIALIZATION_shouldPreserveTypes(done){

        var CacheableFoo = this.Cache.prepare(this.Foo);
        var key = 'serialization-3';

        CacheableFoo.create({
            username: key,
            data: key,
            number: 10,
            boolean: false,
            set: ['t1','t2','t3']
        },(err) => {

            should.not.exist(err);

            CacheableFoo.get(key,(err,foo) => {

                should.not.exist(err);

                foo.fromCache.should.be.ok;

                foo.get('number').should.be.equal(10);
                foo.get('boolean').should.be.equal(false);
                foo.get('set').should.be.deepEqual(['t1','t2','t3']);
                done();

            });

        })

    }

}

module.exports = Tester;