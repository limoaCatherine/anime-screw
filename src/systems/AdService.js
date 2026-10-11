// 激励视频广告服务。
// - GameConfig.ads.douyinRewardedAdUnitId 填了广告位 ID 且运行在抖音小游戏 (有 tt) 时：tt.createRewardedVideoAd
// - 否则 (网页 / 桌面版 / 没填 ID)：显示一个 5 秒的占位倒计时，结束即视为看完
// 用法：const ok = await game.ads.showRewardedAd('revive');   ok=true 才发奖励
import { GameConfig } from '../config/GameConfig.js';

export class AdService {
  constructor(events) {
    this.events = events;
    this.unitId = GameConfig.ads.douyinRewardedAdUnitId;
    this.ad = null;
    this.placeholder = null;   // { left, total, resolve, reason }  由 GameScene/AdOverlay 绘制
    this.busy = false;
    this.watched = 0;
    // eslint-disable-next-line no-undef
    if (this.unitId && typeof tt !== 'undefined' && tt.createRewardedVideoAd) {
      try {
        // eslint-disable-next-line no-undef
        this.ad = tt.createRewardedVideoAd({ adUnitId: this.unitId });
      } catch (err) {
        console.warn('[AdService] 创建激励视频失败，改用占位倒计时', err);
        this.ad = null;
      }
    }
  }

  get mode() { return this.ad ? 'douyin' : 'placeholder'; }

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
          resolve(done(!res || res.isEnded !== false));
        };
        this.ad.onClose(onClose);
        this.ad.show().catch(() => this.ad.load().then(() => this.ad.show())).catch((err) => {
          console.warn('[AdService] 广告拉取失败', err);
          this.ad.offClose(onClose);
          resolve(done(false));
        });
      });
    }
    return new Promise((resolve) => {
      const total = GameConfig.ads.placeholderSeconds;
      this.placeholder = { left: total, total, reason, resolve: (ok) => { this.placeholder = null; resolve(done(ok)); } };
    });
  }

  /** 每帧推进占位倒计时 */
  update(dt) {
    const p = this.placeholder;
    if (!p) return;
    p.left -= dt;
    if (p.left <= 0) p.resolve(true);
  }

  /** 占位广告上的"关闭"：中途关掉不发奖励 */
  cancel() { if (this.placeholder) this.placeholder.resolve(false); }
}
