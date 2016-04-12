# vogels-cache [![Build Status](https://travis-ci.org/adrianocola/vogels-cache.png?branch=master)](https://travis-ci.org/adrianocola/vogels-cache)

Vogels-cache adds a cache layer (backed by [Redis](http://redis.io/)) to your [Vogels](https://github.com/ryanfitz/vogels) models.

## Installation

    npm install vogels-cache --save

## Usage
First you need to configure Vogels-cache with a redis client:
```js
var redis = require("redis").createClient();
var vogelsCache = require('vogels-cache');
vogelsCache.setRedisClient(redis);
```
Then you can use Vogel-cache to create cacheable version of a Vogel model (the original Model will not be altered):
```js
var vogels = require('vogels');
//do vogels setup
var Account = vogels.define('Account', {
  hashKey : 'email',
  schema : {
    email   : Joi.string().email(),
    name    : Joi.string(),
    age     : Joi.number(),
  }
});

var CacheableAccount = vogelsCache.prepare(Account);
//now you can use CacheableAccount as a Vogels Model:
var account = CacheableAccount({
    email: 'foo@bar.com',
    name: 'foo',
    age: 30
});
//save will automatically save the model to redis
account.save();
```

### Cache options
When preparing a Model will can pass some options to vogel-cache:
```js
var CacheableAccount = vogelsCache.prepare(Account,{
    CACHE_RESULT: true, //if all data returned from dynamodb will be cached (default: true)
    CACHE_SKIP: false, //if will skip cache and get data directly from DynamoDB (default:false)
    CACHE_EXPIRE: 3600, //duration (in seconds) that the item will be available in cache (default:undefined, forever)
    redis: undefined //redis client can be setted by model
});
```
You can also pass those 3 first options per request, as Dynamo options:
```js
CacheableAccount.get('foo@bar.com',{CACHE_SKIP:true,CACHE_RESULT:false},function(err,acc){
    //got the account directly from DynamoDB and didn't added it to redis
});
```
**OBS: cache options are removed before sending the request to DynamoDB**

### Model Methods
This is the behavior of each method will have when using its cacheable version (the methods have the same signature as the uncached Vogels Model):
##### .get(hashKey, rangeKey, options, callback)
Will try to get item from cache and fallback to DynamoDB. Accept options CACHE_SKIP and CACHE_RESULT to change this behavior.
##### .create(attrs,options,callback)
Create the item in DynamoDB and then cache it. Accept CACHE_RESULT option to prevent caching.
##### .update(item, options, callback)
By default the returned item will be cached. Accept CACHE_RESULT option to prevent caching.
##### .destroy(hashKey, rangeKey, options, callback)
Remove item from cache after sucessfull deletion from DynamoDB
##### .query(), .scan(), .paralellScan()
By default will cache all items returned in response. If this is not the desired behavior, use the function **.cacheResults(shouldCache,expire)**:
```js
CacheableAccount.query('foo').cacheResults(false).exec(function(err,items){
    //items will not be cached
});
```
##### getItems(keys, options, callback)
First try to get all items from cache and then get missing ones from Dynamo. Tries to keep the returned items in order based on the requested keys order. Add option CACHE_SKIP to fetch directly from Dynamo. Also accept CACHE_RESULT option to prevent caching results.

### Item Methods
Item methods also have other behaviors in they cacheable version (they also share the same method signature of the original Vogel Item):
##### .save(callback)
Cache the model after a sucessfull save. This method dont't allow options (just like Vogels).
##### .update(options,callback)
Cache the model after a sucessfull update. Accept CACHE_RESULT option to prevent caching.
##### .destroy(options,callback)
Delete the model from cache after destroying.

### How to know if an item was cached or came from cache
Every item object cached by Vogel-cache will have the property **cached** setted with the time it whas cached. Every item that was fetched from cache will have the property **fromCache** setted to the time it was fetched from cache. Note that those two properties are setted to the Item object.
```js
CacheableAccount.get('foo',{CACHE_SKIP:true},function(err,item){
    item.cached; //will have the cache time
    item.fromCache; //will be undefined, because we skipped cache
    item.get('email'); //item data
});
```
### License

(The MIT License)

Copyright (c) 2016 Adriano Cola

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.