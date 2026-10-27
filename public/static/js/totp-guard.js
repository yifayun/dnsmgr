(function (window, $) {
    if (!$ || window.__totpAjaxWrapped) return;
    window.__totpAjaxWrapped = true;

    var verifying = false;
    var pendingQueue = [];

    function ensureLayer(cb) {
        if (typeof layer !== 'undefined') {
            cb();
            return;
        }
        var s = document.createElement('script');
        s.src = '/static/js/layer/layer.js';
        s.onload = function () { cb(); };
        s.onerror = function () {
            var code = window.prompt('请输入二次验证动态口令');
            if (code) {
                $.post('/totp/verify', {code: code}, function (res) {
                    if (res && res.code === 0) {
                        flushQueue(true);
                    } else {
                        alert((res && res.msg) || '验证失败');
                        flushQueue(false);
                    }
                }).fail(function () {
                    flushQueue(false);
                });
            } else {
                flushQueue(false);
            }
        };
        document.head.appendChild(s);
    }

    function flushQueue(ok) {
        verifying = false;
        var q = pendingQueue.slice();
        pendingQueue = [];
        q.forEach(function (item) {
            if (ok) {
                item.retry();
            } else if (item.fail) {
                item.fail();
            }
        });
    }

    window.verifyTotpCode = function (done) {
        ensureLayer(function () {
            layer.prompt({
                title: '二次验证 - 请输入动态口令',
                formType: 0,
                maxlength: 6,
                value: '',
                btn: ['验证', '取消']
            }, function (value, index) {
                var code = String(value || '').trim();
                if (!/^\d{6}$/.test(code)) {
                    layer.msg('动态口令格式错误', {icon: 2});
                    return;
                }
                var ii = layer.load(2);
                $.ajax({
                    url: '/totp/verify',
                    type: 'POST',
                    data: {code: code},
                    dataType: 'json',
                    _skipTotpGuard: true,
                    success: function (res) {
                        layer.close(ii);
                        if (res && res.code === 0) {
                            layer.close(index);
                            layer.msg('验证成功', {icon: 1, time: 800});
                            if (typeof done === 'function') done(true);
                        } else {
                            layer.msg((res && res.msg) || '验证失败', {icon: 2});
                            if (typeof done === 'function') done(false);
                        }
                    },
                    error: function () {
                        layer.close(ii);
                        layer.msg('服务器错误', {icon: 2});
                        if (typeof done === 'function') done(false);
                    }
                });
            });
        });
    };

    function requestTotpThen(retry, fail) {
        pendingQueue.push({retry: retry, fail: fail});
        if (verifying) return;
        verifying = true;
        window.verifyTotpCode(function (ok) {
            flushQueue(ok);
        });
    }

    function needsTotp(data) {
        return data && (data.need_totp == 1 || data.need_totp === true || data.code == -2);
    }

    var originalAjax = $.ajax;
    $.ajax = function (url, options) {
        if (typeof url === 'object') {
            options = url;
            url = undefined;
        }
        options = options || {};
        if (options._skipTotpGuard || options._totpRetried) {
            return url === undefined ? originalAjax.call($, options) : originalAjax.call($, url, options);
        }

        var userSuccess = options.success;
        var userError = options.error;
        var userComplete = options.complete;
        var context = options.context;

        options.success = function (data, textStatus, jqXHR) {
            if (needsTotp(data)) {
                var selfArgs = arguments;
                requestTotpThen(function () {
                    var retryOpts = $.extend(true, {}, options);
                    retryOpts._totpRetried = true;
                    retryOpts.success = userSuccess;
                    retryOpts.error = userError;
                    retryOpts.complete = userComplete;
                    if (url === undefined) {
                        originalAjax.call($, retryOpts);
                    } else {
                        originalAjax.call($, url, retryOpts);
                    }
                }, function () {
                    if (typeof layer !== 'undefined') {
                        layer.closeAll('loading');
                    }
                    if (typeof userSuccess === 'function') {
                        userSuccess.apply(context || this, selfArgs);
                    }
                });
                return;
            }
            if (typeof userSuccess === 'function') {
                userSuccess.apply(context || this, arguments);
            }
        };

        return url === undefined ? originalAjax.call($, options) : originalAjax.call($, url, options);
    };
})(window, window.jQuery);
