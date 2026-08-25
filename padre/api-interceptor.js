(function () {
  'use strict';

  if (!location.hostname.includes('padre.gg')) return;

  try {
    var hosts = ['https://translate.googleapis.com', 'https://mozhi.adminforge.de'];
    for (var h = 0; h < hosts.length; h++) {
      var pc = document.createElement('link');
      pc.rel = 'preconnect';
      pc.href = hosts[h];
      pc.crossOrigin = 'anonymous';
      (document.head || document.documentElement).appendChild(pc);
    }
  } catch (_) {}

  var CHANNEL = '__axiom_tx__';

  function findTweets(obj, depth) {
    if (depth > 8 || !obj || typeof obj !== 'object') return [];

    var results = [];

    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length && i < 300; i++) {
        var sub = findTweets(obj[i], depth + 1);
        for (var j = 0; j < sub.length; j++) results.push(sub[j]);
      }
      return results;
    }

    var isSyndicationTweet = obj.__typename === 'Tweet' || obj.__typename === 'TweetWithVisibilityResults';

    var text = obj.text || obj.full_text || obj.tweet_text || obj.tweetText ||
               obj.tweetBody || obj.tweet_body;

    if (!text) {
      text = obj.content || obj.body || obj.description || obj.bio;
    }

    if (isSyndicationTweet && obj.note_tweet && obj.note_tweet.text) {
      text = obj.note_tweet.text;
    }

    if (text && typeof text === 'string' && text.length >= 10) {
      var handle = null;

      if (obj.user && typeof obj.user === 'object') {
        handle = obj.user.screen_name || obj.user.username || obj.user.handle;
      }

      if (!handle && obj.core && obj.core.user_results) {
        try {
          var uLegacy = obj.core.user_results.result.legacy;
          if (uLegacy) handle = uLegacy.screen_name;
        } catch (e) {}
      }

      if (!handle) {
        handle = obj.screen_name || obj.username || obj.authorUsername ||
                 obj.author_username || obj.handle;

        if (!handle && obj.author) {
          if (typeof obj.author === 'string') {
            handle = obj.author;
          } else if (typeof obj.author === 'object') {
            handle = obj.author.screen_name || obj.author.username ||
                     obj.author.handle || obj.author.name;
          }
        }
      }

      if (handle && typeof handle === 'string' && handle.length > 0 && handle.length <= 20) {
        handle = handle.replace(/^@/, '').toLowerCase();
        var id = obj.id_str || obj.id || obj.tweetId || obj.tweet_id ||
                 obj.rest_id || '';
        results.push({
          handle: handle,
          text: text,
          id: id ? String(id) : '',
          name: (obj.user && obj.user.name) || obj.name || obj.displayName ||
                obj.display_name || obj.authorName || obj.author_name || '',
          timestamp: Date.now()
        });
      }
    }

    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length && k < 60; k++) {
      var val = obj[keys[k]];
      if (val && typeof val === 'object') {
        var childResults = findTweets(val, depth + 1);
        for (var c = 0; c < childResults.length; c++) results.push(childResults[c]);
      }
    }

    return results;
  }

  function processResponseText(responseText, source) {

    if (!responseText || responseText.length < 50) return;

    if (responseText.indexOf('"text"') === -1 &&
        responseText.indexOf('"full_text"') === -1 &&
        responseText.indexOf('"content"') === -1 &&
        responseText.indexOf('"body"') === -1 &&
        responseText.indexOf('"tweetText"') === -1 &&
        responseText.indexOf('"tweet_text"') === -1 &&
        responseText.indexOf('"tweetBody"') === -1 &&
        responseText.indexOf('"description"') === -1 &&
        responseText.indexOf('"__typename"') === -1) return;

    try {
      var json = JSON.parse(responseText);
      var tweets = findTweets(json, 0);

      if (tweets.length > 0) {
        window.postMessage({
          channel: CHANNEL,
          type: 'tweets',
          tweets: tweets.length > 100 ? tweets.slice(0, 100) : tweets,
          source: source
        }, location.origin);
      }

      window.postMessage({
        channel: CHANNEL,
        type: 'api_response',
        source: source,
        tweetsFound: tweets.length,
        bodyLength: responseText.length,
        keys: !Array.isArray(json) && typeof json === 'object'
          ? Object.keys(json).slice(0, 15)
          : (Array.isArray(json) ? ['[array:' + json.length + ']'] : [])
      }, location.origin);
    } catch (e) {

    }
  }

  var _fetch = window.fetch;
  window.fetch = function () {
    var url = typeof arguments[0] === 'string'
      ? arguments[0]
      : (arguments[0] && arguments[0].url) || '';
    var source = 'fetch:' + url.substring(0, 150);

    try {
      return _fetch.apply(this, arguments).then(function (response) {
        try {
          var ct = '';
          if (response.headers && response.headers.get) {
            ct = response.headers.get('content-type') || '';
          }

          if (ct.indexOf('json') !== -1 ||
              (ct.indexOf('text') !== -1 && ct.indexOf('html') === -1) ||
              (!ct && response.status === 200)) {
            response.clone().text().then(function (body) {
              processResponseText(body, source);
            }).catch(function () {});
          }
        } catch (e) {}
        return response;
      });
    } catch (e) {
      return _fetch.apply(this, arguments);
    }
  };

  var _xhrOpen = XMLHttpRequest.prototype.open;
  var _xhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__axiomUrl = typeof url === 'string' ? url : String(url || '');
    return _xhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var self = this;
    this.addEventListener('load', function () {
      try {
        var ct = self.getResponseHeader('content-type') || '';
        if ((ct.indexOf('json') !== -1 || ct.indexOf('text') !== -1) &&
            self.responseText) {
          processResponseText(
            self.responseText,
            'xhr:' + (self.__axiomUrl || '').substring(0, 150)
          );
        }
      } catch (e) {}
    });
    return _xhrSend.apply(this, arguments);
  };

  try {
    var _WS = window.WebSocket;
    window.WebSocket = new Proxy(_WS, {
      construct: function (target, args) {
        var ws = new target(args[0], args[1]);
        var wsUrl = typeof args[0] === 'string' ? args[0] : '';
        ws.addEventListener('message', function (event) {
          if (typeof event.data === 'string' && event.data.length > 50) {
            processResponseText(event.data, 'ws:' + wsUrl.substring(0, 80));
          }
        });
        return ws;
      }
    });
  } catch (e) {

  }

  try {
    if (window.EventSource) {
      var _ES = window.EventSource;
      window.EventSource = new Proxy(_ES, {
        construct: function (target, args) {
          var es = new target(args[0], args[1]);
          var esUrl = typeof args[0] === 'string' ? args[0] : '';
          es.addEventListener('message', function (event) {
            if (typeof event.data === 'string' && event.data.length > 50) {
              processResponseText(event.data, 'sse:' + esUrl.substring(0, 80));
            }
          });
          return es;
        }
      });
    }
  } catch (e) {}

  window.postMessage({
    channel: CHANNEL,
    type: 'ready',
    timestamp: Date.now()
  }, location.origin);


})();
