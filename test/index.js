var assert = require('assert');
var should = require('should');
var sinon  = require('sinon');
var Vogels = require('vogels');
var async = require('async');
var Joi = require('joi');

var redis = require("fakeredis").createClient();


var VogelsCache = require('../index.js');
VogelsCache.setRedisClient(redis);

var Foo,Bar;

describe('vogels-cache',function(){

    before(function(done){

        this.timeout(10000);

        Vogels.AWS.config.update({endpoint: 'http://localhost:8801', region: 'REGION', accessKeyId: 'abc', secretAccessKey: '123'});

        Foo = Vogels.define('foo', {
            tableName: 'foo',
            hashKey : 'username',
            schema : {
                username: Joi.string(),
                data: Joi.string()
            }
        });

        Bar = Vogels.define('bar', {
            tableName: 'bar',
            hashKey : 'username',
            rangeKey: 'message',
            schema : {
                username: Joi.string(),
                message: Joi.string(),
                data: Joi.string()
            }
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

    describe('schema',function(){

        describe('get()',function(){

            it('should get from cache by default',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'schema-get-1';

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
                var key = 'schema-get-2';

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
                var key = 'schema-get-3';

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
                var key = 'schema-get-5';

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

        });

        describe('create()',function(){

            it('should cache by default',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'schema-create-1';

                var foo = CacheableFoo.create({
                    username: key,
                    data: 'bar'
                },function(){

                    redis.exists('foo:'+key,function(err,exist){
                        (!err).should.be.ok;
                        exist.should.be.equal(1);
                        done();
                    })

                });

            });

            it('should NOT cache if CACHE_RESULT:false passed as option',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'schema-create-2';

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

        });

        describe('update()',function(){

            it('should cache by default',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'schema-update-1';

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
                var key = 'schema-update-2';

                createFoo(key,true,function(){
                    CacheableFoo.update({username: key,data:'updated'},{CACHE_RESULT:false},function(err,foo){

                        (!err).should.be.ok;
                        (!foo.cached).should.be.ok;
                        (!foo.fromCache).should.be.ok;

                        redis.hget('foo:'+key,'data',function(err,data){
                            (!err).should.be.ok;
                            data.should.be.equal(key); //should be equal old cached value
                            done();
                        });

                    });
                });

            });

        });

        describe('destroy()',function(){

            it('should also remove from cache',function(done){

                var CacheableFoo = VogelsCache.prepare(Foo);
                var key = 'schema-destroy-1';

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

            it('should cache by default',function(done){

                var CacheableBar = VogelsCache.prepare(Bar);
                var key = 'schema-query-1';

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

            it('should not cache if called cacheResults(false) in query',function(done){

                var CacheableBar = VogelsCache.prepare(Bar);
                var key = 'schema-query-2';

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

        });

        describe('getItems()',function(){

            it('should cache by default',function(done){

                var CacheableBar = VogelsCache.prepare(Bar);
                var key = 'schema-getItems-1';
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

            it('should search in cache and fallback to DynamoDB by default',function(done){

                var CacheableBar = VogelsCache.prepare(Bar);
                var key = 'schema-getItems-2';
                var items = [
                    {username: key, message:'a'},
                    {username: key, message:'c'}, //don't exist
                    {username: key, message:'b'}
                ];

                createBar(key,'a',false,function(){ //a is not cached
                    createBar(key,'b',true,function(){ //b is cached
                        CacheableBar.getItems(items,function(err,bars){

                            (!err).should.be.ok;

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
                var key = 'schema-getItems-3';
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
                var key = 'schema-getItems-4';
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
                        (!b1.fromCache).should.be.ok;
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
                var key = 'user-item-save1';

                var foo = new CacheableFoo({
                    username: key,
                    data: 'bar'
                });
                foo.save(function(err){

                    (!err).should.be.ok;

                    redis.exists('foo:'+key,function(err,exist){
                        (!err).should.be.ok;
                        exist.should.be.ok;
                        done();
                    })

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




});