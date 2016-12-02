var Tester = require('./tester');

let tester;

describe('vogels',function(){

    before(function(done){

        this.timeout(5000);

        tester = new Tester('vogels',done);
    });

    describe('model',function(){

        describe('get()',function(){

            it('should get from cache by default',function(done){

                tester.MODEL_GET_shouldGetFromCacheByDefault(done);

            });

            it('should try to get from cache first but fallback to DynamoDB by default',function(done){

                tester.MODEL_GET_shouldTryToGetGromCacheFirstButFallbackToDynamoDBByDefault(done);

            });

            it('should not get from cache if CACHE_SKIP:true is set',function(done){

                tester.MODEL_GET_shouldNotGetFromCacheIfCACHE_SKIPTrueIsSet(done);

            });

            it('should not save to cache if CACHE_RESULT:false',function(done){

                tester.MODEL_GET_shouldNotSaveToCacheIfCACHE_RESULTFalse(done);

            });

        });

        describe('create()',function(){

            it('should cache by default',function(done){

                tester.MODEL_CREATE_shouldCacheByDefault(done);

            });

            it('should cache creation of multiple items',function(done){

                tester.MODEL_CREATE_shouldCacheCreationOfMultipleItems(done);

            });

            it('should NOT cache if CACHE_RESULT:false passed as option',function(done){

                tester.MODEL_CREATE_shouldNOTCacheIfCACHE_RESULTFalsePassedAsOption(done);

            });

            it('should set cache expire if CACHE_EXPIRE passed as option',function(done){

                tester.MODEL_CREATE_shouldSetCacheExpireIfCacheExpirePassedAsOption(done);

            });

        });

        describe('update()',function(){

            it('should not cache and delete from cache after update',function(done){

                tester.MODEL_UPDATE_shouldNotCacheAndDeleteFromCacheAfterUpdate(done);

            });

            it('should cache if passed option CACHE_RESULT:true',function(done){

                tester.MODEL_UPDATE_shouldCacheIfPassedOptionCacheResultTrue(done);

            });

        });

        describe('destroy()',function(){

            it('should also remove from cache',function(done){

                tester.MODEL_DESTROY_shouldAlsoRemoveFromCache(done);

            });

        });

        describe('query()',function(){

            it('should not cache by default',function(done){

                tester.MODEL_QUERY_shouldNotCacheByDefault(done);

            });

            it('should cache if called cacheResults(true) in query',function(done){

                tester.MODEL_QUERY_shouldCacheIfCalledCacheResultsTrueInQuery(done);

            });

        });

        describe('uncache()',function(){

            it('should cache new model',function(done){

                tester.MODEL_UNCACHE_shouldCacheNewModel(done);

            });

        });

        describe('getItems()',function(){

            it('should cache by default',function(done){

                tester.MODEL_GETITEMS_shouldCacheByDefault(done);

            });

            it('should not try to fetch from DynamoDB if found all in cache',function(done){

                tester.MODEL_GETITEMS_shouldNotTryToFetchFromDynamoDbIfFoundAllInCache(done);

            });

            it('should search in cache and fallback to DynamoDB by default',function(done){

                tester.MODEL_GETITEMS_shouldSearchInCacheAndFallbackToDynamoDbByDefault(done);

            });

            it('should not get from cache if CACHE_SKIP:true is set',function(done){

                tester.MODEL_GETITEMS_shouldNotGetFromCacheIfCacheSkipTrueIsSet(done);

            });

            it('should not cache if CACHE_RESULT:false is set',function(done){

                tester.MODEL_GETITEMS_shouldNotCacheIfCacheResultFalseIsSet(done);

            });

        });

    });

    describe('item',function(){

        describe('save()',function(){

            it('should cache by default',function(done){

                tester.ITEM_SAVE_shouldCacheByDefault(done);

            });

        });

        describe('update()',function(){

            it('should not cache and delete from cache after update',function(done){

                tester.ITEM_UPDATE_shouldNotCacheAndDeleteFromCacheAfterUpdate(done);

            });

            it('should cache if passed option CACHE_RESULT:true',function(done){

                tester.ITEM_UPDATE_shouldCacheIfPassedOptionCacheResultTrue(done);

            });

        });

        describe('destroy()',function(){

            it('should also remove from cache',function(done){

                tester.ITEM_DESTROY_shouldAlsoRemoveFromCache(done);

            });

        });

        describe('uncache()',function(){

            it('should remove only from cache',function(done){

                tester.ITEM_UNCACHE_shouldRemoveOnlyFromCache(done);

            });

        });

    });

    describe('expire',function(){

        it('should cache expire if CACHE_EXPIRE is setted',function(done){

            tester.EXPIRE_shouldCacheExpireIfCacheExpireIsSetted(done);

        });

    });

    describe('serialization',function(){

        it('should preserve types',function(done){

            tester.SERIALIZATION_shouldPreserveTypes(done);

        });

    });

});