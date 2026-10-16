(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else if (typeof define === 'function' && define.amd) define([], function () { return factory(root); });
  else root.ZEROMemberAuth = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  // https://github.com/supabase/auth/blob/master/internal/api/otp.go
  // https://github.com/supabase/auth/blob/master/internal/api/verify.go
  // No session is retained. The caller clears contact, code and access token after use.
  var TIMEOUT_MS = 5000, MAX_BODY = 65536;
  function fail(code) {
    var error = new Error(code);
    error.code = code;
    return error;
  }
  function checkMethod(method) {
    if (method !== 'email' && method !== 'phone') throw fail('AUTH_METHOD_INVALID');
  }
  function normalizeContact(method, value) {
    checkMethod(method);
    if (typeof value !== 'string' || value.length > 254 || /[\x00-\x1f\x7f]/.test(value)) throw fail('AUTH_CONTACT_INVALID');
    value = value.trim();
    if (method === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw fail('AUTH_CONTACT_INVALID');
      return value.toLowerCase();
    }
    if (!/^[+0-9 ()-]+$/.test(value)) throw fail('AUTH_CONTACT_INVALID');
    value = value.replace(/[ ()-]/g, '');
    if (/^010[0-9]{8}$/.test(value)) value = '+82' + value.slice(1);
    if (!/^\+[1-9][0-9]{7,14}$/.test(value)) throw fail('AUTH_CONTACT_INVALID');
    return value;
  }
  function publicKey(value) {
    if (typeof value !== 'string' || value.length > 4096) return false;
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false;
    try {
      var parts = value.split('.');
      var decode = function (part) { return JSON.parse(root.atob(part.replace(/-/g, '+').replace(/_/g, '/'))); };
      return ['HS256', 'ES256', 'RS256'].includes(decode(parts[0]).alg) && decode(parts[1]).role === 'anon';
    } catch (_) { return false; }
  }
  function provider(config, method) {
    checkMethod(method);
    if (!config || config.provider !== 'supabase' || config[method + '_enabled'] !== true ||
        typeof config.supabase_url !== 'string' || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.supabase_url) ||
        !publicKey(config.publishable_key)) throw fail('AUTH_DISABLED');
    return { url: config.supabase_url, key: config.publishable_key };
  }
  async function request(config, endpoint, payload, code) {
    var controller = new root.AbortController(), reader, response, timer, failureCode = code;
    var expired = new Promise(function (_, reject) {
      timer = root.setTimeout(function () { reject(fail(code)); controller.abort(); }, TIMEOUT_MS);
    });
    try {
      return await Promise.race([expired, (async function () {
        response = await root.fetch(config.url + '/auth/v1/' + endpoint, {
          method: 'POST',
          headers: { apikey: config.key, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload), signal: controller.signal,
          redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
        });
        // Only status-derived codes leave this boundary; provider bodies may contain private contacts.
        if (!response.redirected && response.status === 429) failureCode = 'AUTH_RATE_LIMITED';
        else if (!response.redirected && endpoint === 'otp' && response.status >= 500) failureCode = 'AUTH_DELIVERY_UNAVAILABLE';
        if (response.redirected || response.status !== 200 || Number(response.headers.get('content-length')) > MAX_BODY) throw fail(failureCode);
        reader = response.body.getReader();
        var decoder = new root.TextDecoder('utf-8', { fatal: true }), size = 0, body = '';
        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_BODY) throw fail(code);
          body += decoder.decode(chunk.value, { stream: true });
        }
        var data = JSON.parse(body + decoder.decode());
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail(code);
        // Strip session/refresh tokens inside the response boundary, before returning.
        if (endpoint === 'otp') return undefined;
        var accessToken = data.access_token;
        if (typeof accessToken !== 'string' || accessToken.length > 16384 ||
            !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)) throw fail(code);
        return { access_token: accessToken };
      }())]);
    } catch (_) { throw fail(failureCode); }
    finally {
      root.clearTimeout(timer);
      controller.abort();
      if (reader) void reader.cancel().catch(function () {});
      else if (response && response.body) void response.body.cancel().catch(function () {});
    }
  }
  async function sendCode(config, method, contact) {
    var target = provider(config, method), normalized = normalizeContact(method, contact);
    var payload = { create_user: true };
    payload[method] = normalized;
    if (method === 'phone') payload.channel = 'sms';
    await request(target, 'otp', payload, 'AUTH_SEND_FAILED');
  }
  async function verifyCode(config, method, contact, code) {
    var target = provider(config, method), normalized = normalizeContact(method, contact);
    if (typeof code !== 'string' || !/^[0-9]{6,10}$/.test(code)) throw fail('AUTH_CODE_INVALID');
    var payload = { type: method === 'email' ? 'email' : 'sms', token: code };
    payload[method] = normalized;
    return request(target, 'verify', payload, 'AUTH_VERIFY_FAILED');
  }
  return Object.freeze({ normalizeContact: normalizeContact, sendCode: sendCode, verifyCode: verifyCode });
}));
