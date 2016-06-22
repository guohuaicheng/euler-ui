import superagent from 'superagent'
import _ from 'lodash'
var SRequest = superagent.Request;

import Notify from "../notification"
var check = function(regex) {
  return regex.test(window.navigator.userAgent.toLowerCase());
}
var isOpera = check(/opera/);
var isIE = !isOpera && (check(/msie/) || check(/trident/));

var prefix = "";
var REQUEST_MAPS;

function init() {
  var requestConf = require("./RequestConf").getRequestConf();
  var buildEnv = requestConf.BUILD_ENV || '';
  var __DEV__ = buildEnv === 'DEV' || buildEnv === '';
  var __SIT__ = buildEnv === 'SIT';
  var __UAT__ = buildEnv === 'UAT';
  var __PROD__ = buildEnv === 'PROD';

  if (__PROD__) {
    prefix = "/api"
  }
  REQUEST_MAPS = requestConf.settings;
}

/**
dispatch => {
  myRequest({
    url: "USER_LOGIN", // key at conf*.json
    method: 'get', //post or get or put or delete
    queryParams: { // query parameters
      parma1: 'value1',
      parma2: 'value2'
    },
    restParams: {
      productId: "1000"
      // if path at conf*.json is '/issues/product/:productId/groupbystatus', the real path will be 
      // '/issues/product/1000/groupbystatus'    
    }
    data: { // post data
      userName: 'Tom',
      age: 28
    },
    headers: { //header data
      'Context-type': "text"
    }
  }, (err, response) => { //http://visionmedia.github.io/superagent/#response-properties
    dispatch({
      type: types.USER_LOGIN,
      response: response.body
    })
  })
}**/
var Request = function(options, cb) {
  if (!REQUEST_MAPS) {
    init();
  }

  var url = options.url;
  var method = options.method || 'GET'; // get, post, get, put
  method = method.toUpperCase();
  var data = options.data || {}; //key, value
  var dataType = options.dataType; //xml, json, script, html
  var headers = options.headers || {}; // key, value
  var valMap = REQUEST_MAPS[url] || {};
  url = valMap.path || url;
  var source = valMap.source;
  var queryParams = options.queryParams;
  var restParams = options.restParams;



  if (/^(\/|\\)/.test(source)) {
    url = source;
    method = "GET";
  }

  _.each(restParams, (val, key) => {
    var regex = new RegExp(`:${key}(/|$)`, "g");
    url = url.replace(regex, function(match, group) {
      return val + group;
    })
  })

  if (prefix) {
    if (/^(\/|\\)/.test(url)) {
      url = prefix + url;
    } else {
      url = prefix + "/" + url;
    }
  }
  if (isIE) {
    url = url + "?ts=" + new Date().getTime();
  }

  var newRequest;
  if ("GET" === method) {
    newRequest = superagent.get(url);
  } else if ("POST" === method) {
    newRequest = superagent.post(url).send(data);
  } else if ("PUT" === method) {
    newRequest = superagent.put(url).send(data);
  } else if ("DELETE" === method) {
    newRequest = superagent.del(url);
  }
  if (queryParams && _.isPlainObject(queryParams)) {
    newRequest.query(queryParams);
  }
  newRequest = newRequest.set(headers);
  if (cb) {
    var handleError = function(err, res) {
      console.error('oh no. err at Request.js', err);
      if (err && err.statusCode === 404) {
        console.log('404', res.body);
      // TODO rethink best approach.
      // fix uuid parse as json issue.
      } else if (err && err.statusCode === 200) {
        if (!res) {
          res = {}
        }
        res.body = err.rawResponse || "";
      } else {
        console.log('Other errors', err);
        var errText = err && err.response && err.response.text;
        var errObj = errText && JSON.parse(errText);
        if (errObj && errObj.errorCode === "IAM_00013") {
          // TODO i18n
          Notify.create({
            message: "当前会话已失效，请重新登录!"
          })
          sessionStorage.setItem("userInfo", "");
          // TODO bad code, backend should handel session timeout!
          setTimeout(() => {
            window.location = "/"
          }, 2000)
        }
      }
      cb(err, res)
    }
    newRequest.end(function(error, response) {
      if (error) {
        handleError(error, response);
        return;
      }

      if (cb) {
        cb(error, response);
      }
    });
  }
  return newRequest;
}

SRequest.prototype.promise = function() {
  return new Promise(function(resolve, reject, onCancel) {
    req.end(function(err, res) {
      if (typeof res !== "undefined" && res.status >= 400) {
        var msg = 'cannot ' + req.method + ' ' + req.url + ' (' + res.status + ')';
        error = new SuperagentPromiseError(msg);
        error.status = res.status;
        error.body = res.body;
        error.res = res;
        reject(error);
      } else if (err) {
        reject(new SuperagentPromiseError('Bad request', err));
      } else {
        resolve(res);
      }
    });
    onCancel(function() {
      req.abort();
    });
  });
}

SRequest.prototype.then = function() {
  var promise = this.promise();
  return promise.then.apply(promise, arguments);
};

export default Request