<?php

namespace app\lib;

use think\facade\Cache;
use think\response\Json;

class TotpGuard
{
    public const TTL = 600;
    public const MASK = '********';
    public const ALL_SCENES = ['login', 'dns_write', 'view_secret'];

    public static function parseScenes($user): array
    {
        if (empty($user) || empty($user['totp_open']) || empty($user['totp_secret'])) {
            return [];
        }
        if (empty($user['totp_scenes'])) {
            // 兼容旧数据：仅开启登录二次验证
            return ['login'];
        }
        $scenes = json_decode($user['totp_scenes'], true);
        if (!is_array($scenes)) {
            return ['login'];
        }
        return array_values(array_intersect($scenes, self::ALL_SCENES));
    }

    public static function needScene($user, string $scene): bool
    {
        return in_array($scene, self::parseScenes($user), true);
    }

    public static function normalizeScenes($scenes): array
    {
        if (!is_array($scenes)) {
            $scenes = [];
        }
        $scenes = array_values(array_intersect($scenes, self::ALL_SCENES));
        return $scenes ?: self::ALL_SCENES;
    }

    public static function isStepUpValid($uid): bool
    {
        if (empty($uid)) {
            return false;
        }
        $t = Cache::get('totp_stepup_' . $uid);
        return $t && (time() - (int)$t) < self::TTL;
    }

    public static function markStepUp($uid): void
    {
        Cache::set('totp_stepup_' . $uid, time(), self::TTL);
    }

    public static function clearStepUp($uid): void
    {
        Cache::delete('totp_stepup_' . $uid);
    }

    /**
     * 需要场景二次验证且未通过 step-up 时返回统一 JSON，否则返回 null
     * @return Json|null
     */
    public static function requireScene($user, string $scene)
    {
        if (!self::needScene($user, $scene)) {
            return null;
        }
        if (!empty($user['id']) && self::isStepUpValid($user['id'])) {
            return null;
        }
        return json(['code' => -2, 'need_totp' => 1, 'msg' => '需要二次验证']);
    }

    public static function maskConfig(?string $configJson): string
    {
        if ($configJson === null || $configJson === '') {
            return '';
        }
        $config = json_decode($configJson, true);
        if (!is_array($config)) {
            return $configJson;
        }
        foreach ($config as $key => $value) {
            if (is_bool($value) || $key === 'proxy') {
                continue;
            }
            if (is_array($value)) {
                continue;
            }
            if ($value === null || $value === '') {
                continue;
            }
            $config[$key] = self::MASK;
        }
        return json_encode($config, JSON_UNESCAPED_UNICODE);
    }

    public static function mergeMaskedConfig(array $newConfig, array $oldConfig): array
    {
        foreach ($newConfig as $key => $value) {
            if ($value === self::MASK && array_key_exists($key, $oldConfig)) {
                $newConfig[$key] = $oldConfig[$key];
            }
        }
        return $newConfig;
    }
}
