var redis = require("redis");
var Twit = require('twit');
var async = require('async');

/**
 * Represents a FatNest singleton
 * @constructor
 * @param {object} config The configuration for the site
 */
function FatNest(config) {
	console.log(config);
	this._config = config;
	this._redisClient = redis.createClient();
	this._twits = {};
	this._userCache = {};

	return this;
}

/* Private Methods */

/**
 * Check if a value is numeric
 * @param  {any}  n The value in question
 * @return {Boolean}   
 */
FatNest.prototype._isNumeric = function(n) {
	return !isNaN(parseFloat(n)) && isFinite(n);
};

/**
 * Return a Twit instance for a given user ID's credentials.
 * @param  {string}   id The Twitter ID of the user
 * @param  {Function} cb Callback(err, client)
 * @return {Function}      Return this instance for method chaning
 */
FatNest.prototype._getTwitterClient = function(id, cb) {

	var getKeysCB = (function(err, obj) {
			if (err === null && obj) {
				this._twits[id] = new Twit({
					consumer_key: this._config.TWITTER_CONSUMER_KEY,
					consumer_secret: this._config.TWITTER_CONSUMER_SECRET,
					access_token: obj.token,
					access_token_secret: obj.tokenSecret
				});
				cb(null, this._twits[id]);
			} else if (err === null && !obj) {
				cb("No API Client recorded for " + id);
			} else {
				cb(err, null);
			}
		}).bind(this);

	if (this._twits[id] === undefined) {
		this._redisClient.hgetall(id.toString() + ':keys', getKeysCB);
	} else {
		cb(null, this._twits[id]);
	}

	return this;
};

/**
 * Some kind of hacky thing I need to refactor that binds a userId to the scope of the tweetEmbed method...
 * @param  {string} userId The Twitter User ID
 * @return {Function}        A closure that runs tweetEmbed with the userId bound to the scope
 */
FatNest.prototype._tweetEmbedClosure = function(userId) {
	return (function(tweetId, cb) {
			return this.tweetEmbed(userId, tweetId, cb);
		}).bind(this);
};

/**
 * This method gets a Twitter client for a user for that has been delegated to another user,
 * and checks to ensure that this is allowed.
 * 				
 * @param  {string}   forId    The user ID requesting the client
 * @param  {string}   fromId   The ID of the user being requested
 * @param  {Function} callback callback(err, client)
 * @return {Function}            Returns this for chaining
 */
FatNest.prototype._getTwitterClientFor = function(forId, fromId, callback) {

	var getDelegatedCB = (function(err, users) {
	
			var found = false;
	
			for(var u in users) {
				console.log(users[u], fromId);
				if (fromId == users[u].id) {
					found = true;
					break;
				}
			}
	
			if (found) 
				this._getTwitterClient(fromId, callback);
			else 
				callback("Access denied", null);
		}).bind(this);	

	this.getDelegatedAccounts(forId, getDelegatedCB);

	return this;
};



/* Public Methods */

/**
 * Saves user info from sign-in into Redis so that Twitter clients can be instantiated later
 * @param  {string} token       The token returned by the Twitter auth flow and Passport
 * @param  {string} tokenSecret The tokenSecret returned by the Twitter auth flow and Passport
 * @param  {Object} profile     The user object returned by Twitter/Passport
 * @return {Function}             Return this for chaining
 */
FatNest.prototype.saveUser = function(token, tokenSecret, profile) {
	var payload = { token: token, tokenSecret: tokenSecret, username: profile.username };
	this._redisClient.hmset(profile.id.toString() + ':keys', payload);

	return this;
};

/**
 * Get a Twitter user from Twitter using a given user's credentials
 * @param  {string}   clientId The user ID requesting the user
 * @param  {string}   userId   The user ID being requested
 * @param  {Function} callback callback(err, user)
 * @return {Function}            Return this for chaining
 */
FatNest.prototype.getUser = function(clientId, userId, callback) {

	var twitterClientCB = (function(err, twit) {
			if (err) {
				callback(err, null);
				return;
			}
	
			if (this._userCache[userId] !== undefined) {
				callback(null, this._userCache[userId]);
				return;
			}
	
			var data = {};
	
			if (this._isNumeric(userId)) {
				data.user_id = userId;
			} else {
				data.screen_name = userId;
			}
	
			twit.get('users/show', data, showCB);
		}).bind(this);

	var showCB = (function(err, user) {
			this._userCache[userId] = user;
			callback(null, user);
			return;
		}).bind(this);

	this._getTwitterClient(clientId, twitterClientCB);

	return this;
};


/**
 * Get a list of users given the list of user IDs
 * @param  {string}   clientId The ID of the requesting user
 * @param  {array}   userIds  The list of string IDs to retrieve users for
 * @param  {Function} callback callback(err, users)
 * @return {Function}            Return this for chaining
 */
FatNest.prototype.getUsers = function(clientId, userIds, callback) {

	var users = [];
	var newUserIds = [];

	// Make the real list of users to retrieve

	for(var u in userIds) {
			var twitterId = userIds[u];
			if (this._userCache[twitterId] !== undefined) {
				users.push(this._userCache[twitterId]);
			} else {
				newUserIds.push(twitterId);
			}
	}

	if (newUserIds.length > 100) {
		throw "Too many user to fetch from Twitter";
	}

	var twitterClientCB = (function(err, twit) {
			if (err) {
				callback(err, null);
				return;
			}
	
			if (newUserIds.length > 0) {
				twit.post('users/lookup', { user_id: newUserIds }, lookupCB);
			} else {
				callback(null, users);
			}
		}).bind(this);

	var lookupCB = (function(err, outUsers) {
			for(var u in outUsers) {
				var user = outUsers[u];
				this._userCache[user.id] = user;
				users.push(user);
			}
			callback(null, users);
		}).bind(this);

	this._getTwitterClient(clientId, twitterClientCB);

	return this;
};


/**
 * Get the OEmbed markup for a tweet
 * @param  {string}   userId The user ID requesting the OEmbed
 * @param  {Object}   tweet  The previously fetched Tweet from Twitter
 * @param  {Function} cb     callback(err, html)
 * @return {Function}          Return this for chaining
 */
FatNest.prototype.tweetEmbed = function(userId, tweet, cb) {

	var newhtml;

	var tweetIDCB = (function(err, html) {
			if (err) {
				cb(err, null);
				return;
			}
	
			if (html === null) {
				this._getTwitterClient(userId, twitterClientCB);
			} else {
				cb(null, html);
			}
		}).bind(this);

	var twitterClientCB = (function(err, twit) {
			if (err) {
				cb(err, null);
				return;
			}
			twit.get('statuses/oembed', { id: tweetId, omit_script: true, hide_thread: true }, oembedCB);
		}).bind(this);

	var oembedCB = (function(err, data, response) {
			if (err) {
				cb(err, null);
				return;
			}
	
			// strip out js.
			newhtml = data.html.replace(this._config.TWITTER_JS, '');
			console.log(data.html);
			this._redisClient.set('tweet_' + tweetId, data.html, setTweetCB);
		}).bind(this);

	var setTweetCB = (function(err) {
			if (err) {
				cb(err, null);
				return;
			}
			cb(null, newhtml);
		}).bind(this);

	var tweetId = tweet.id_str;
	this._redisClient.get('tweet_' + tweetId, tweetIDCB);

	return this;
};

/**
 * Get the list of accounts the requesting client has delegated access to
 * @param  {string}   userId   The ID of the requesting user
 * @param  {Function} callback callback(err, array)
 * @return {Function}            Return this for chaining
 */
FatNest.prototype.getDelegatedToAccounts = function(userId, callback) {

	var delegatesCB = (function(err, twitter_ids) {
			if (err) {
				callback(err, null);
				return;
			}
	
			// FIXME handle this in a non-hacky way
			twitter_ids = twitter_ids.slice(0, 100);
			this.getUsers(userId, twitter_ids, usersCB);
		}).bind(this);

	var usersCB = (function(err, users) {
			if (err) {
				callback(err, null);
				return;
			}
	
			callback(null, users);
		}).bind(this);

	this._redisClient.smembers(userId + ':delegated-to', delegatesCB);

	return this;
};

/**
 * Get the list of accounts this user has access to tweet as
 * @param  {string}   userId   The requesting user ID
 * @param  {Function} callback callback(err, array)
 * @return {Function}            Return this for chaining
 */
FatNest.prototype.getDelegatedAccounts = function(userId, callback) {

	var tempUsers;

	var delegatedCB = (function(err, twitter_ids) {
			if (err) {
				callback(err, null);
				return;
			}
	
			// FIXME handle this in a non-hacky way
			twitter_ids = twitter_ids.slice(0, 100);
			this.getUsers(userId, twitter_ids, twitterUsersCB);
		}).bind(this);

	var twitterUsersCB = (function(err, users) {
			if (err) {
				callback(err, null);
				return;
			}
			tempUsers = users;
			this.getUser(userId, userId, cachedUserCB);
		}).bind(this);

	var cachedUserCB = (function(err, user) {
			if (err) {
				callback(err, null);
				return;
			}
			tempUsers.push(user);
			callback(null, tempUsers);
		}).bind(this);

	this._redisClient.smembers(userId + ':delegated', delegatedCB);

	return this;
};

/**
 * Remove another user's ability to tweet as this user
 * @param  {string}   userId       The user requesting the change for themselves
 * @param  {string}   targetUserId The user that should have its access removed
 * @param  {Function} callback     callback(err, success)
 * @return {Function}                Return this for chaining
 */
FatNest.prototype.removeDelegate = function(userId, targetUserId, callback) {

	var delegatedCB = (function(err, res) {
			if (err) {
				callback(err, undefined);
				return;
			}
	
			this._redisClient.srem(targetUserId + ':delegated', userId, removedCB);
		}).bind(this);

	var removedCB = (function(err, res) {
			if (err) {
				callback(err, undefined);
				return;
			}
	
			callback(undefined, true);
		}).bind(this);

	this._redisClient.srem(userId + ':delegated-to', targetUserId, delegatedCB);

	return this;
};

/**
 * Allow another user to tweet as the requesting account
 * @param  {string}   userId     The user requesting this
 * @param  {string}   screenName The screen name of the user that should be given access
 * @param  {Function} callback   callback(err, user)
 * @return {Function}              Return this for chaining
 */
FatNest.prototype.createDelegate = function(userId, screenName, callback) {

	var delegateUser;

	var cachedUserCB = (function(err, user) {
			delegateUser = user;
			console.log(user);
			if (err) {
				callback(err, undefined);
				return;
			}
			this._redisClient.sadd(userId + ':delegated-to', delegateUser.id, delegatedCB);
		}).bind(this);

	var delegatedCB = (function(err, res) {
			if (err) {
				callback(err, undefined);
				return;
			}
			this._redisClient.sadd(delegateUser.id + ':delegated', userId, addedCB);
		}).bind(this);

	var addedCB = (function(err, res) {
			if (err) {
				callback(err, undefined);
				return;
			}
			callback(undefined, delegateUser);
		}).bind(this);

	this.getUser(userId, screenName, cachedUserCB);

	return this;
};

/**
 * Get the embed HTML for the recent tweets list
 * @param  {string}   user_id  The user to get recent tweets for. The user must have saved credentials.
 *                             This bypasses access restrictions, because by delegating access you are 
 *                             allowing this user to see your tweets.
 * @param  {Function} callback callback(err, html)
 * @return {Function}            Return this for chaining
 */
FatNest.prototype.recentTweets = function(user_id, callback) {

    var getClientCallback = (function(err, twit) {
    		if (err === null) {
    			twit.get('statuses/user_timeline', { count: 5, user_id: user_id }, timelineCallback);
    		} else {
    			console.error(err);
    		}
    	}).bind(this);

	var timelineCallback = (function(err, data, response) {
			var closure = this._tweetEmbedClosure(user_id);
	
			async.map(data, closure, callback);
		}).bind(this);

	this._getTwitterClient(user_id, getClientCallback);

	return this;
};

/**
 * Remove a tweet as a user
 * @param  {string}   authorId   The user requesting this change
 * @param  {string}   deleteAsId The user owning the tweet that should be deleted
 * @param  {string}   tweetId    The ID of the tweet that should be deleted
 * @param  {Function} callback   callback(err, success)
 * @return {Function}              Return this for chaining
 */
FatNest.prototype.removeTweet = function(authorId, deleteAsId, tweetId, callback) {

	var getClientCallback = (function(err, twit) {
			if (err === null) {
				twit.post('statuses/destroy/' + tweetId, deleteCallback);
			} else {
				console.error(err);
				callback(err, null);
			}
		}).bind(this);

	var deleteCallback = (function(err, data, response) {
			if (err === null) {
				callback(null, data);
			} else {
				callback(err, null);
			}
		}).bind(this);

	this._getTwitterClientFor(authorId, deleteAsId, getClientCallback);

	return this;
};

/**
 * Tweet as a user
 * @param  {string}   authorId  The user requesting this change
 * @param  {string}   postAsId  The user that the tweet will be posted as
 * @param  {string}   tweetBody The body of the tweet
 * @param  {Function} callback  callback(err, tweet)
 * @return {Function}             Return this for chaining
 */
FatNest.prototype.postTweet = function(authorId, postAsId, tweetBody, callback) {

	var getClientCallback = (function(err, twit) {
			if (err === null) {
				twit.post('statuses/update', { status: tweetBody }, tweetCallback);
			} else {
				console.error(err);
				callback(err, null);
			}
		}).bind(this);

	var tweetCallback = (function(err, data, response) {
			if (err === null) {
				callback(null, data);
			} else {
				callback(err, null);
			}
		}).bind(this);

	this._getTwitterClientFor(authorId, postAsId, getClientCallback);

	return this;
};

module.exports = FatNest;