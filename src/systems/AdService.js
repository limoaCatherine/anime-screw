// 激励视频广告服务。
// - 抖音 / 微信小游戏：广告位 ID 取 game-config.js 的 rewardedAdUnitId (构建时由 douyin/douyin.config.json、wechat/wechat.config.json 生成)，
//   或 GameConfig.ads.douyinRewardedAdUnitId；填了真实 ID 就走 tt/wx.createRewardedVideoAd (平台层 createRewardedAd)
//   onClose 回调：有 count 字段时以 count>0 判断看完 (抖音官方建议)，否则看 isEnded (微信只有 isEnded)
// - 没有可用广告 (网页 / 桌面版 / 小游戏还没填广告位 ID)：enabled=false，
//   界面上所有「看广告」入口都隐藏：复活换成每关一次免费「再试一次」，道具用完了每天可免费领一次，第三个盒位不出现。
//   填上广告位 ID 后 (流量主开通、广告位创建后) 一切自动恢复为激励视频。
// - devPlaceholder=true (仅测试脚本用)：用 5 秒占位倒计时模拟一次广告
// 用法：if (game.ads.enabled) { const ok = await game.ads.showRewardedAd('revive'); }   ok=true 才发奖励
import { GameConfig } from '../config/GameConfig.js';
import { platform } from '../platform/index.js';

const realId = (id) => (typeof id === 'string' && id.trim() && !/^YOUR_/i.test(id.trim()) ? id.trim() : '');

export class AdService {
  constructor(events) {
    this.events = events;
    this.unitId = realId((platform.config && platform.config.rewardedAdUnitId) || '') || realId(GameConfig.ads.douyinRewardedAdUnitId);
    this.ad = null;
    this.placeholder = null;   // { left, total, resolve, reason }  由 GameScene/AdOverlay 绘制
    this.busy = false;
    this.watched = 0;
    this.devPlaceholder = false;
    if (this.unitId && typeof platform.createRewardedAd === 'function') {
      try {
        this.ad = platform.createRewardedAd(this.unitId);   // 抖音 tt / 微信 wx .createRewardedVideoAd
      } catch (err) {
        console.warn('[AdService] 创建激励视频失败，改用占位倒计时', err);
        this.ad = null;
      }
    }
  }

  /** 有真实激励视频 (或测试用占位) 时才显示「看广告」入口 */
  get enabled() { return !!this.ad || !!this.devPlaceholder; }
  get mode() { return this.ad ? platform.name : this.devPlaceholder ? 'placeholder' : 'off'; }

  showRewardedAd(reason = '') {
    if (this.busy) return Promise.resolve(false);
    this.busy = true;
    this.events.emit('ad:start', { reason, mode: this.mode });
    const done = (ok) => {
      this.busy = false;
      if (ok) this.watched++;
      this.events.emit('ad:end', { reason, ok });
      return ok;
    };
    if (this.ad) {
      return new Promise((resolve) => {
        const onClose = (res) => {
          this.ad.offClose(onClose);
          const ok = !!res && (typeof res.count === 'number' ? res.count > 0 : !!res.isEnded);
          if (!ok) this.events.emit('ad:notFinished', { reason });
          resolve(done(ok));
        };
        this.ad.onClose(onClose);
        this.ad.show().catch(() => this.ad.load().then(() => this.ad.show())).catch((err) => {
          console.warn('[AdService] 广告拉取失败', err);
          this.ad.offClose(onClose);
          resolve(done(false));
        });
      });
    }
    if (!this.devPlaceholder) {
      // 没有广告位：界面本不该调到这里 (入口都已隐藏)；不放假广告，也不发奖励
      console.warn('[AdService] 没有可用的激励视频广告位', reason);
      return Promise.resolve(done(false));
    }
    return new Promise((resolve) => {
      const total = GameConfig.ads.placeholderSeconds;
      this.placeholder = { left: total, total, reason, start: Date.now(), resolve: (ok) => { this.placeholder = null; resolve(done(ok)); } };
    });
  }

  /** 每帧推进占位倒计时 */
  update(dt) {
    const p = this.placeholder;
    if (!p) return;
    // 按真实时间倒数 (掉帧时 dt 会被截断，按 dt 累加会让 5 秒广告变长)
    p.left = Math.min(p.left - dt, p.total - (Date.now() - p.start) / 1000);
    if (p.left <= 0) p.resolve(true);
  }

  /** 占位广告上的"关闭"：中途关掉不发奖励 */
  cancel() { if (this.placeholder) this.placeholder.resolve(false); }
}
