var should = require('should');
var Vogels = require('vogels');
var async = require('async');
var Joi = require('joi');

var redis = require("fakeredis").createClient();

var localDynamo = require('local-dynamo');
var VogelsCache = require('../index.js');
VogelsCache.setRedisClient(redis);

var Foo,Bar;

describe('vogels-cache',function(){

    before(function(done){

        this.timeout(5000);

        localDynamo.launch({
            port: 4567,
            sharedDb: true,
            heap: '512m'
        });
        Vogels.AWS.config.update({endpoint: 'http://localhost:4567', region: 'REGION', accessKeyId: 'abc', secretAccessKey: '123'});

        Foo = Vogels.define('foo', {
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

        Bar = Vogels.define('bar', {
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
    });

    function createFoo(username,cache,cb){
        if(cache){
            var CacheableFoo = VogelsCache.prepare(Foo);
            CacheableFoo.create({
                username: username,
                data: username
            },cb);
        }else{
            Foo.create({
                username: username,
                data: username
            },cb);
        }
    }

    function createBar(username,message,cache,cb){
        if(cache){
            var CacheableBar = VogelsCache.prepare(Bar);
            CacheableBar.create({
                username: username,
                message: message,
                data: message
            },cb);
        }else{
            Bar.create({
                username: username,
                message: message,
                data: message
            },cb);
        }
    }

    function createBars(username,messages,cache,cb){
        async.each(messages,function(message,cb){
            createBar(username,message,cache,cb);
        },cb);
    }

    describe('model',function(){

        describe('get()',function(){

            it('should get from cache by default',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'model-get-1';

                createFoo(key,true,function(){
                    CacheableFoo.get(key,function(err,foo){

                        (!err).should.be.ok;
                        (!foo.cached).should.be.ok;
                        foo.fromCache.should.be.ok;
                        done();

                    });
                });

            });

            it('should try to get from cache first but fallback to DynamoDB by default',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'model-get-2';

                createFoo(key,false,function(){
                    CacheableFoo.get(key,function(err,foo){

                        (!err).should.be.ok;
                        foo.cached.should.be.ok;
                        (!foo.fromCache).should.be.ok;
                        done();

                    });
                });

            });

            it('should not get from cache if CACHE_SKIP:true is set',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'model-get-3';

                createFoo(key,true,function(){
                    CacheableFoo.get(key,{CACHE_SKIP:true},function(err,foo){

                        (!err).should.be.ok;
                        foo.cached.should.be.ok;
                        (!foo.fromCache).should.be.ok;
                        done();

                    });
                });

            });

            it('should not save to cache if CACHE_RESULT:false',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'model-get-5';

                createFoo(key,false,function(){
                    CacheableFoo.get(key,{CACHE_SKIP:true,CACHE_RESULT:false},function(err,foo){

                        (!err).should.be.ok;
                        (!foo.cached).should.be.ok;
                        (!foo.fromCache).should.be.ok;

                        redis.exists('foo:'+key,function(err,exist){
                            (!err).should.be.ok;
                            exist.should.be.equal(0);
                            done();
                        });

                    });
                });

            });

            it('should not save to cache if AttributesToGet is used',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'model-get-6';

                createFoo(key,false,function(){
                    CacheableFoo.get(key,{AttributesToGet:'number'},function(err,foo){

                        (!err).should.be.ok;
                        (!foo.cached).should.be.ok;
                        (!foo.fromCache).should.be.ok;

                        redis.exists('foo:'+key,function(err,exist){
                            (!err).should.be.ok;
                            exist.should.be.equal(0);
                            done();
                        });

                    });
                });

            });

        });

        describe('create()',function(){

            it('should cache by default',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'model-create-1';

                var foo = CacheableFoo.create({
                    username: key,
                    data: 'bar'
                },function(err){

                    (!err).should.be.ok;

                    redis.exists('foo:'+key,function(err,exist){
                        (!err).should.be.ok;
                        exist.should.be.equal(1);
                        done();
                    })

                });

            });

            it('should cache creation of multiple items',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
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
                ],function(err){

                    (!err).should.be.ok;

                    redis.exists('foo:'+key1,function(err,exist){
                        (!err).should.be.ok;
                        exist.should.be.equal(1);

                        redis.exists('foo:'+key2,function(err,exist){
                            (!err).should.be.ok;
                            exist.should.be.equal(1);
                            done();
                        })

                    })

                });

            });

            it('should NOT cache if CACHE_RESULT:false passed as option',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'model-create-3';

                var foo = CacheableFoo.create({
                    username: key,
                    data: 'bar'
                },{CACHE_RESULT: false},function(){

                    redis.exists('foo:'+key,function(err,exist){
                        (!err).should.be.ok;
                        exist.should.be.equal(0);
                        done();
                    })

                });

            });

            it('should set cache expire if CACHE_EXPIRE passed as option',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'model-create-4';
                var expire = 10;

                var foo = CacheableFoo.create({
                    username: key,
                    data: 'bar'
                },{CACHE_EXPIRE: expire},function(){

                    redis.ttl('foo:'+key,function(err,ttl){
                        (!err).should.be.ok;
                        ttl.should.be.equal(expire);
                        done();
                    })

                });

            });

        });

        describe('update()',function(){

            it('should cache by default',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'model-update-1';

                createFoo(key,false,function(){
                    CacheableFoo.update({username: key,data:'updated'},function(err,foo){

                        (!err).should.be.ok;
                        foo.cached.should.be.ok;
                        (!foo.fromCache).should.be.ok;

                        redis.exists('foo:'+key,function(err,exist){
                            (!err).should.be.ok;
                            exist.should.be.equal(1);
                            done();
                        });

                    });
                });

            });

            it('should NOT cache if CACHE_RESULT:false passed as option',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'model-update-2';

                createFoo(key,true,function(){
                    CacheableFoo.update({username: key,data:'updated'},{CACHE_RESULT:false},function(err,foo){

                        (!err).should.be.ok;
                        (!foo.cached).should.be.ok;
                        (!foo.fromCache).should.be.ok;

                        redis.get('foo:'+key,function(err,data){
                            (!err).should.be.ok;
                            data.indexOf('updated').should.be.equal(-1); //should be equal old cached value
                            done();
                        });

                    });
                });

            });

        });

        describe('destroy()',function(){

            it('should also remove from cache',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'model-destroy-1';

                createFoo(key,true,function(){
                    CacheableFoo.destroy(key,function(err){

                        (!err).should.be.ok;

                        redis.exists('foo:'+key,function(err,exist){
                            (!err).should.be.ok;
                            exist.should.be.equal(0);
                            done();
                        });

                    });
                });

            });

        });

        describe('query()',function(){

            it('should not cache by default',function(done){

                var CacheableBar = VogelsCache.prepare(Bar);
                var key = 'model-query-3';

                createBars(key,['a','b'],false,function(){
                    CacheableBar.query(key).cacheResults(false).exec(function(err,bars){

                        (!err).should.be.ok;

                        var b0 = bars.Items[0];
                        (!b0.cached).should.be.ok;
                        (!b0.fromCache).should.be.ok;

                        var b1 = bars.Items[1];
                        (!b1.cached).should.be.ok;
                        (!b1.fromCache).should.be.ok;

                        done();

                    });
                });

            });

            it('should cache if called cacheResults(true) in query',function(done){

                var CacheableBar = VogelsCache.prepare(Bar);
                var key = 'model-query-1';

                createBars(key,['a','b'],false,function(){
                    CacheableBar.query(key).exec(function(err,bars){

                        (!err).should.be.ok;

                        var b0 = bars.Items[0];
                        b0.cached.should.be.ok;
                        (!b0.fromCache).should.be.ok;

                        var b1 = bars.Items[1];
                        b1.cached.should.be.ok;
                        (!b1.fromCache).should.be.ok;

                        done();

                    });
                });

            });

        });

        describe('uncache()',function(){

            it('should cache new model',function(done){

                var key = 'model-uncache-1';
                var CacheableFoo = VogelsCache.prepare(Foo);

                var foo = CacheableFoo.create({
                    username: key,
                    data: 'bar'
                },function(err){

                    (!err).should.be.ok;

                    redis.exists('foo:'+key,function(err,exist){
                        (!err).should.be.ok;
                        exist.should.be.equal(1);

                        CacheableFoo.uncache(key,function(err){

                            (!err).should.be.ok;

                            redis.exists('foo:'+key,function(err,exist){
                                (!err).should.be.ok;
                                exist.should.be.equal(0);

                                CacheableFoo.get(key,function(err,foo){

                                    (!err).should.be.ok;
                                    foo.should.be.ok;
                                    foo.cached.should.be.ok;
                                    (!foo.fromCache).should.be.ok;

                                    done();

                                });

                            });

                        });

                    });

                });

            });

        });

        describe('getItems()',function(){

            it('should cache by default',function(done){

                var CacheableBar = VogelsCache.prepare(Bar);
                var key = 'model-getItems-1';
                var items = [
                    {username: key, message:'a'},
                    {username: key, message:'b'}
                ];

                createBars(key,['a','b'],false,function(){
                    CacheableBar.getItems(items,function(err,bars){

                        (!err).should.be.ok;

                        var b0 = bars[0];
                        b0.cached.should.be.ok;
                        (!b0.fromCache).should.be.ok;

                        var b1 = bars[1];
                        b1.cached.should.be.ok;
                        (!b1.fromCache).should.be.ok;

                        done();

                    });
                });

            });

            it('should not try to fetch from DynamoDB if found all in cache',function(done){

                var CacheableBar = VogelsCache.prepare(Bar);
                var key = 'model-getItems-1';
                var items = [
                    {username: key, message:'a'},
                    {username: key, message:'b'}
                ];

                createBars(key,['a','b'],true,function(){
                    CacheableBar.getItems(items,function(err,bars){

                        (!err).should.be.ok;

                        var b0 = bars[0];
                        (!b0.cached).should.be.ok;
                        b0.fromCache.should.be.ok;

                        var b1 = bars[1];
                        (!b1.cached).should.be.ok;
                        b1.fromCache.should.be.ok;

                        done();

                    });
                });

            });

            it('should search in cache and fallback to DynamoDB by default',function(done){

                var CacheableBar = VogelsCache.prepare(Bar);
                var key = 'model-getItems-2';
                var items = [
                    {username: key, message:'a'},
                    {username: key, message:'c'}, //don't exist
                    {username: key, message:'b'},
                    {username: key, message:'d'} //don't exist
                ];

                createBar(key,'a',false,function(){ //a is not cached
                    createBar(key,'b',true,function(){ //b is cached
                        CacheableBar.getItems(items,function(err,bars){

                            (!err).should.be.ok;

                            bars.length.should.be.equal(2);

                            var b0 = bars[0]; //a not from cache
                            b0.cached.should.be.ok;
                            (!b0.fromCache).should.be.ok;

                            var b1 = bars[1]; //b from cache
                            (!b1.cached).should.be.ok;
                            b1.fromCache.should.be.ok;

                            done();

                        });
                    });
                });

            });

            it('should not get from cache if CACHE_SKIP:true is set',function(done){

                var CacheableBar = VogelsCache.prepare(Bar);
                var key = 'model-getItems-3';
                var items = [
                    {username: key, message:'a'},
                    {username: key, message:'b'}
                ];

                createBars(key,['a','b'],true,function(){ //is in cache
                    CacheableBar.getItems(items,{CACHE_SKIP:true},function(err,bars){

                        (!err).should.be.ok;

                        var b0 = bars[0];
                        b0.cached.should.be.ok;
                        (!b0.fromCache).should.be.ok;

                        var b1 = bars[1];
                        b1.cached.should.be.ok;
                        (!b1.fromCache).should.be.ok;

                        done();

                    });
                });

            });

            it('should not cache if CACHE_RESULT:false is set',function(done){

                var CacheableBar = VogelsCache.prepare(Bar);
                var key = 'model-getItems-4';
                var items = [
                    {username: key, message:'a'},
                    {username: key, message:'b'}
                ];

                createBars(key,['a','b'],false,function(){
                    CacheableBar.getItems(items,{CACHE_RESULT:false},function(err,bars){

                        (!err).should.be.ok;

                        var b0 = bars[0];
                        (!b0.cached).should.be.ok;
                        (!b0.fromCache).should.be.ok;

                        var b1 = bars[1];
                        (!b1.cached).should.be.ok;
                        (!b1.fromCache).should.be.ok;

                        redis.exists('foo:'+key+':a',function(err,exist){
                            (!err).should.be.ok;
                            exist.should.be.equal(0);
                            redis.exists('foo:'+key+':b',function(err,exist){
                                (!err).should.be.ok;
                                exist.should.be.equal(0);
                                done();
                            });
                        });

                    });
                });

            });

        });

    });

    describe('item',function(){

        describe('save()',function(){

            it('should cache by default',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'item-save-1';

                var foo = new CacheableFoo({
                    username: key,
                    data: 'bar'
                });
                foo.save(function(err){

                    (!err).should.be.ok;
                    foo.cached.should.be.ok;

                    redis.exists('foo:'+key,function(err,exist){
                        (!err).should.be.ok;
                        exist.should.be.ok;
                        done();
                    })

                });

            });

        });

        describe('update()',function(){

            it('should cache by default',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'item-update-1';

                createFoo(key,true,function(){
                    CacheableFoo.get(key,function(err,foo){

                        (!err).should.be.ok;

                        foo.set({data: 'new value'});
                        foo.update(function(err){

                            (!err).should.be.ok;
                            foo.cached.should.be.ok;

                            redis.get('foo:'+key,function(err,data){
                                (!err).should.be.ok;
                                data.indexOf('new value').should.not.be.equal(-1);
                                done();
                            });

                        });

                    });
                });

            });

            it('should not cache if CACHE_RESULT:false is set',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'item-update-2';

                createFoo(key,true,function(){
                    CacheableFoo.get(key,function(err,foo){

                        (!err).should.be.ok;

                        foo.set({data: 'new value'});
                        foo.update({CACHE_RESULT:false},function(err){

                            (!err).should.be.ok;

                            redis.get('foo:'+key,function(err,data){
                                (!err).should.be.ok;
                                data.indexOf('new value').should.be.equal(-1);
                                done();
                            });

                        });

                    });
                });

            });

        });

        describe('destroy()',function(){

            it('should also remove from cache',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'item-destroy-1';

                createFoo(key,true,function(){
                    CacheableFoo.get(key,function(err,foo){

                        (!err).should.be.ok;

                        foo.destroy(function(err){

                            (!err).should.be.ok;

                            redis.exists('foo:'+key,function(err,exists){
                                (!err).should.be.ok;
                                exists.should.be.equal(0);
                                done();
                            });

                        });

                    });
                });

            });

        });

        describe('uncache()',function(){

            it('should remove only from cache',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'item-uncache-1';

                createFoo(key,true,function(){
                    CacheableFoo.get(key,function(err,foo){

                        (!err).should.be.ok;

                        foo.uncache(function(err){

                            (!err).should.be.ok;

                            redis.exists('foo:'+key,function(err,exists){
                                (!err).should.be.ok;
                                exists.should.be.equal(0);

                                CacheableFoo.get(key,function(err,foo){

                                    (!err).should.be.ok;
                                    foo.should.be.ok;
                                    foo.cached.should.be.ok;
                                    (!foo.fromCache).should.be.ok;

                                    done();

                                });

                            });

                        });

                    });
                });

            });

        });

    });

    describe('expire',function(){

        it('should cache expire if CACHE_EXPIRE is setted',function(done){

            var CacheableFoo = VogelsCache.prepare(Foo);
            var key = 'expire-1';

            var foo = CacheableFoo.create({
                username: key,
                data: key
            },{CACHE_EXPIRE:1},function(err){

                (!err).should.be.ok;

                redis.exists('foo:'+key,function(err,exist){
                    (!err).should.be.ok;
                    exist.should.be.ok; //is in cache
                    setTimeout(function(){

                        redis.exists('foo:'+key,function(err,exist){
                            (!err).should.be.ok;
                            (!exist).should.be.ok; //should not be in cache anymore
                            done();
                        })

                    },1000);
                })

            });

        });

    });

    describe('serialization',function(){

        it('should preserve types',function(done){

            var CacheableFoo = VogelsCache.prepare(Foo);
            var key = 'serialization-3';

            CacheableFoo.create({
                username: key,
                data: key,
                number: 10,
                boolean: false,
                set: ['t1','t2','t3']
            },function(err){

                (!err).should.be.ok;

                CacheableFoo.get(key,function(err,foo){

                    (!err).should.be.ok;

                    foo.fromCache.should.be.ok;

                    foo.get('number').should.be.equal(10);
                    foo.get('boolean').should.be.equal(false);
                    foo.get('set').should.be.deepEqual(['t1','t2','t3']);
                    done();

                });

            })

        });

    });

});