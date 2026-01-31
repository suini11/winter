// virtual-clock.js
// 全局虚拟时钟 + 悬浮控制面板
(function () {
    'use strict';

    // ========= 1. 基础配置 =========
    const STORAGE_KEY = 'virtualClockState_v1';
    const POS_KEY = 'virtualClockWidgetPos_v1';

    const RealDate = Date;          // 保留真实 Date
    const RealNow = RealDate.now;   // 保留真实时间戳

    // 工具函数
    const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
    const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

    function clamp(val, min, max) {
        return Math.min(max, Math.max(min, val));
    }

    // ========= 2. 读取 / 保存状态 =========
    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (
                typeof obj.baseRealTime === 'number' &&
                typeof obj.baseVirtualTime === 'number' &&
                typeof obj.speed === 'number'
            ) {
                return obj;
            }
            return null;
        } catch (e) {
            console.warn('[VirtualClock] loadState error', e);
            return null;
        }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(clockState));
        } catch (e) {
            console.warn('[VirtualClock] saveState error', e);
        }
    }

    // 初始状态：首次打开 = 当前真实时间
    let clockState = loadState();
    if (!clockState) {
        const now = RealNow();
        clockState = {
            baseRealTime: now,
            baseVirtualTime: now,
            speed: 1
        };
        saveState();
    }

    function getVirtualNow() {
        const nowReal = RealNow();
        const elapsed = nowReal - clockState.baseRealTime;
        return clockState.baseVirtualTime + elapsed * clockState.speed;
    }

    function getVirtualDate() {
        return new RealDate(getVirtualNow());
    }

    // ========= 3. 订阅系统（内部用来刷新 UI） =========
    const subscribers = [];
    function notifySubscribers() {
        const snapshot = getClockState();
        subscribers.forEach(fn => {
            try {
                fn(snapshot);
            } catch (e) {
                console.warn('[VirtualClock] subscriber error', e);
            }
        });
    }

    function getClockState() {
        return {
            baseRealTime: clockState.baseRealTime,
            baseVirtualTime: clockState.baseVirtualTime,
            speed: clockState.speed,
            virtualNow: getVirtualNow()
        };
    }

    // ========= 4. 对外暴露的 VirtualClock API =========
    const VirtualClock = {
        // 返回虚拟时间戳（ms）
        now() {
            return getVirtualNow();
        },
        // 返回虚拟 Date 对象
        getDate() {
            return getVirtualDate();
        },
        // 只设置“当前虚拟时间”（不改流速）
        setTime(dateOrMs) {
            const targetMs =
                typeof dateOrMs === 'number' ? dateOrMs : dateOrMs.getTime();
            const realNow = RealNow();
            clockState.baseRealTime = realNow;
            clockState.baseVirtualTime = targetMs;
            saveState();
            notifySubscribers();
        },
        // 设置流速（倍速：1 = 正常，2 = 两倍，0.5 = 半速）
        setSpeed(speed) {
            const safe = speed > 0 ? speed : 1;
            // 先把当前虚拟时间固定下来，再更新基准
            const currentVirtual = getVirtualNow();
            const realNow = RealNow();
            clockState.baseRealTime = realNow;
            clockState.baseVirtualTime = currentVirtual;
            clockState.speed = safe;
            saveState();
            notifySubscribers();
        },
        // 重置：虚拟时间 = 当前真实时间，流速 = 1x
        reset() {
            const now = RealNow();
            clockState.baseRealTime = now;
            clockState.baseVirtualTime = now;
            clockState.speed = 1;
            saveState();
            notifySubscribers();
        },
        // 读取完整状态
        getState() {
            return getClockState();
        },
        // 订阅变化
        subscribe(fn) {
            if (typeof fn === 'function') {
                subscribers.push(fn);
                // 立即推送一次当前状态
                try {
                    fn(getClockState());
                } catch (e) {
                    console.warn('[VirtualClock] subscriber error', e);
                }
                return () => {
                    const idx = subscribers.indexOf(fn);
                    if (idx >= 0) subscribers.splice(idx, 1);
                };
            }
            return () => { };
        }
    };

    // 暴露到全局，方便你之后在别的 JS 里用
    window.VirtualClock = VirtualClock;
    // 如果要拿真实时间，可以用 window.RealDate / RealDate.now()
    window.RealDate = RealDate;

    // ========= 5. 全局劫持 Date =========
    // 让 new Date() / Date.now() 默认使用虚拟时间
    (function patchDate() {
        const OriginalDate = RealDate;

        function VirtualDate(...args) {
            // 作为函数调用：Date()
            if (!(this instanceof VirtualDate)) {
                // 保持原始行为：返回当前时间的字符串（这里仍用真实时间）
                return OriginalDate().toString();
            }

            // 作为构造器：new Date()
            if (args.length === 0) {
                // 无参数 = 当前虚拟时间
                return new OriginalDate(VirtualClock.now());
            }
            // 有参数时保持原有语义（年份/月/日等），避免破坏其他逻辑
            return new OriginalDate(...args);
        }

        // 让 instanceof 判断和原生一样
        VirtualDate.prototype = OriginalDate.prototype;

        // 静态方法
        VirtualDate.now = function () {
            return VirtualClock.now();
        };
        VirtualDate.parse = OriginalDate.parse;
        VirtualDate.UTC = OriginalDate.UTC;
        VirtualDate.prototype.constructor = VirtualDate;

        // 尽量保持其它静态属性
        Object.getOwnPropertyNames(OriginalDate).forEach((key) => {
            if (typeof VirtualDate[key] === 'undefined') {
                try {
                    VirtualDate[key] = OriginalDate[key];
                } catch (e) {
                    // 某些只读属性忽略
                }
            }
        });

        // 真正覆盖全局 Date
        window.Date = VirtualDate;
    })();

    // ========= 6. UI：悬浮按钮 + 控制面板 =========
    function injectStyles() {
        if (document.getElementById('virtual-clock-style')) return;
        const style = document.createElement('style');
        style.id = 'virtual-clock-style';
        style.textContent = `
      .vc-floating-container {
        position: fixed;
        z-index: 9999;
        left: auto;
        top: auto;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        user-select: none;
      }

      .vc-floating-btn {
        width: 46px;
        height: 46px;
        border-radius: 999px;
        background: var(--accent-color, #ff6b81);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        box-shadow: 0 6px 16px rgba(0,0,0,0.25);
        cursor: pointer;
        touch-action: none;
      }

      .vc-floating-btn span {
        font-size: 11px;
        line-height: 1.1;
        text-align: center;
      }

      .vc-panel {
        position: absolute;
        right: 0;
        bottom: 56px;
        width: 260px;
        max-width: 80vw;
        background: rgba(255, 255, 255, 0.96);
        color: #222;
        border-radius: 14px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.35);
        padding: 10px 12px 12px;
        backdrop-filter: blur(10px);
        box-sizing: border-box;
      }

      .vc-panel-dark {
        background: rgba(20, 20, 20, 0.96);
        color: #f5f5f5;
      }

      .vc-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
        font-size: 13px;
        font-weight: 600;
      }

      .vc-badge {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(255, 107, 129, 0.12);
        color: var(--accent-color, #ff6b81);
      }

      .vc-panel-close {
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        opacity: 0.7;
      }

      .vc-panel-close:hover {
        opacity: 1;
      }

      .vc-row {
        margin-bottom: 6px;
        font-size: 12px;
      }

      .vc-row label {
        display: block;
        margin-bottom: 2px;
        opacity: 0.8;
      }

      .vc-row-compact {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .vc-row-compact input[type="number"] {
        width: 60px;
      }

      .vc-input, .vc-input-number {
        width: 100%;
        box-sizing: border-box;
        padding: 4px 6px;
        border-radius: 6px;
        border: 1px solid rgba(0,0,0,0.12);
        font-size: 12px;
        font-family: inherit;
        background: rgba(255,255,255,0.85);
      }

      .vc-panel-dark .vc-input,
      .vc-panel-dark .vc-input-number {
        background: rgba(0,0,0,0.4);
        border-color: rgba(255,255,255,0.15);
        color: inherit;
      }

      .vc-btn-row {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
        margin-top: 4px;
      }

      .vc-btn {
        border-radius: 999px;
        border: none;
        padding: 3px 10px;
        font-size: 11px;
        cursor: pointer;
        font-family: inherit;
      }

      .vc-btn-primary {
        background: var(--accent-color, #ff6b81);
        color: #fff;
      }

      .vc-btn-secondary {
        background: rgba(0,0,0,0.06);
        color: inherit;
      }

      .vc-btn-danger {
        background: rgba(255, 59, 48, 0.12);
        color: #ff3b30;
      }

      .vc-panel-dark .vc-btn-secondary {
        background: rgba(255,255,255,0.08);
      }

      .vc-panel-dark .vc-btn-danger {
        background: rgba(255, 59, 48, 0.12);
        color: #ff6b6b;
      }

      .vc-current-text {
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 2px;
      }

      .vc-tip {
        font-size: 10px;
        opacity: 0.7;
      }

      @media (max-width: 480px) {
        .vc-panel {
          width: 230px;
        }
      }
    `;
        document.head.appendChild(style);
    }

    function createWidget() {
        injectStyles();

        const container = document.createElement('div');
        container.className = 'vc-floating-container';

        // 初始位置：右下角
        let pos = null;
        try {
            const raw = localStorage.getItem(POS_KEY);
            if (raw) pos = JSON.parse(raw);
        } catch (e) {
            pos = null;
        }

        if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
            container.style.left = pos.left + 'px';
            container.style.top = pos.top + 'px';
        } else {
            const vw = window.innerWidth || 400;
            const vh = window.innerHeight || 800;
            const left = vw - 80;
            const top = vh - 180;
            container.style.left = left + 'px';
            container.style.top = top + 'px';
        }

        // 1) 漂浮按钮
        const btn = document.createElement('div');
        btn.className = 'vc-floating-btn';
        const btnInner = document.createElement('span');
        btnInner.textContent = '虚\n时';
        btnInner.style.whiteSpace = 'pre';
        btn.appendChild(btnInner);

        // 2) 控制面板
        const panel = document.createElement('div');
        panel.className = 'vc-panel';
        panel.style.display = 'none';

        panel.innerHTML = `
      <div class="vc-panel-header">
        <div>虚拟时钟 <span class="vc-badge">全局</span></div>
        <div class="vc-panel-close" title="收起">×</div>
      </div>
      <div class="vc-row">
        <div class="vc-current-text" id="vc-current-display">--</div>
        <div class="vc-tip" id="vc-speed-display">流速: 1x</div>
      </div>
      <div class="vc-row">
        <label for="vc-datetime-input">设置虚拟时间</label>
        <input id="vc-datetime-input" type="datetime-local" class="vc-input" />
      </div>
      <div class="vc-row vc-row-compact">
        <label for="vc-speed-input" style="margin:0;">流速</label>
        <input id="vc-speed-input" type="number" min="0.1" step="0.1" class="vc-input-number"
               style="padding:3px 6px;" />
        <span class="vc-tip">x（1 = 正常）</span>
      </div>
      <div class="vc-btn-row">
        <button class="vc-btn vc-btn-secondary" id="vc-now-btn">设为现在</button>
        <button class="vc-btn vc-btn-danger" id="vc-reset-btn">重置</button>
        <button class="vc-btn vc-btn-primary" id="vc-apply-btn">应用</button>
      </div>
    `;

        container.appendChild(panel);
        container.appendChild(btn);
        document.body.appendChild(container);

        // 深色模式简单判断：根据 body 背景粗略判断一下
        try {
            const bg = getComputedStyle(document.body).backgroundColor || '';
            if (bg) {
                // 很粗暴的一个判断，足够用了
                const match = bg.match(/\d+/g);
                if (match && match.length >= 3) {
                    const r = parseInt(match[0], 10);
                    const g = parseInt(match[1], 10);
                    const b = parseInt(match[2], 10);
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    if (brightness < 128) {
                        panel.classList.add('vc-panel-dark');
                    }
                }
            }
        } catch (e) {
            // 忽略
        }

        const closeBtn = panel.querySelector('.vc-panel-close');
        const currentDisplay = panel.querySelector('#vc-current-display');
        const speedDisplay = panel.querySelector('#vc-speed-display');
        const inputDatetime = panel.querySelector('#vc-datetime-input');
        const inputSpeed = panel.querySelector('#vc-speed-input');
        const applyBtn = panel.querySelector('#vc-apply-btn');
        const resetBtn = panel.querySelector('#vc-reset-btn');
        const nowBtn = panel.querySelector('#vc-now-btn');

        // 打开时同步当前数据到输入框
        function syncInputsFromState() {
            const vDate = getVirtualDate();
            const y = vDate.getFullYear();
            const m = pad2(vDate.getMonth() + 1);
            const d = pad2(vDate.getDate());
            const hh = pad2(vDate.getHours());
            const mm = pad2(vDate.getMinutes());
            // datetime-local 格式：YYYY-MM-DDTHH:MM
            inputDatetime.value = `${y}-${m}-${d}T${hh}:${mm}`;
            inputSpeed.value = clockState.speed.toFixed(2);
        }

        function togglePanel(show) {
            const isShown = panel.style.display !== 'none';
            const target = typeof show === 'boolean' ? show : !isShown;
            panel.style.display = target ? 'block' : 'none';
            if (target) {
                syncInputsFromState();
            }
        }

        closeBtn.addEventListener('click', () => togglePanel(false));
        btn.addEventListener('click', (e) => {
            // 拖动时会被阻止点击，这里的点击只是兜底
            if ((e.__vcDragged)) return;
            togglePanel();
        });

        nowBtn.addEventListener('click', () => {
            // 设置虚拟时间 = 当前真实时间（不改流速）
            VirtualClock.setTime(RealNow());
            syncInputsFromState();
        });

        resetBtn.addEventListener('click', () => {
            VirtualClock.reset();
            syncInputsFromState();
        });

        applyBtn.addEventListener('click', () => {
            // 1）应用时间
            const val = inputDatetime.value;
            if (val) {
                // 自己解析，避免时区偏移
                const [datePart, timePart] = val.split('T');
                if (datePart && timePart) {
                    const [yy, mm, dd] = datePart.split('-').map((s) => parseInt(s, 10));
                    const [HH, MM] = timePart.split(':').map((s) => parseInt(s, 10));
                    if (!isNaN(yy) && !isNaN(mm) && !isNaN(dd) && !isNaN(HH) && !isNaN(MM)) {
                        const newDate = new RealDate(yy, mm - 1, dd, HH, MM);
                        VirtualClock.setTime(newDate);
                    }
                }
            }

            // 2）应用流速
            const speedVal = parseFloat(inputSpeed.value);
            if (!isNaN(speedVal) && speedVal > 0) {
                VirtualClock.setSpeed(speedVal);
            }

            syncInputsFromState();
        });

        // 订阅虚拟时钟变化 → 刷新显示
        function updatePanelDisplay() {
            const vDate = getVirtualDate();
            const y = vDate.getFullYear();
            const m = pad2(vDate.getMonth() + 1);
            const d = pad2(vDate.getDate());
            const h = pad2(vDate.getHours());
            const mi = pad2(vDate.getMinutes());
            const s = pad2(vDate.getSeconds());
            const wd = WEEKDAYS[vDate.getDay()];
            currentDisplay.textContent = `${y}-${m}-${d} (${wd}) ${h}:${mi}:${s}`;
            speedDisplay.textContent = `流速: ${clockState.speed.toFixed(2)}x`;
        }

        VirtualClock.subscribe(updatePanelDisplay);
        // 让面板里的时间每秒跳动
        setInterval(updatePanelDisplay, 1000);
        // ========= 7. 漂浮按钮拖动 =========
        let dragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let startLeft = 0;
        let startTop = 0;
        let pointerId = null;
        let moved = false;

        function savePosition(left, top) {
            try {
                localStorage.setItem(POS_KEY, JSON.stringify({ left, top }));
            } catch (e) {
                // 忽略
            }
        }

        function onPointerDown(e) {
            dragging = true;
            moved = false;
            pointerId = e.pointerId;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = container.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            btn.setPointerCapture(pointerId);
            e.preventDefault();
            e.stopPropagation();
        }

        function onPointerMove(e) {
            if (!dragging || e.pointerId !== pointerId) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
            const newLeft = startLeft + dx;
            const newTop = startTop + dy;

            const vw = window.innerWidth || 400;
            const vh = window.innerHeight || 800;
            const clampedLeft = clamp(newLeft, 4, vw - 60);
            const clampedTop = clamp(newTop, 24, vh - 80);

            container.style.left = clampedLeft + 'px';
            container.style.top = clampedTop + 'px';
        }

        function onPointerUp(e) {
            if (!dragging || e.pointerId !== pointerId) return;
            dragging = false;
            try {
                btn.releasePointerCapture(pointerId);
            } catch (_) { }
            pointerId = null;

            const rect = container.getBoundingClientRect();
            savePosition(rect.left, rect.top);

            // 拖动了就不当点击处理
            if (moved) {
                e.__vcDragged = true;
            }
        }

        btn.addEventListener('pointerdown', onPointerDown);
        btn.addEventListener('pointermove', onPointerMove);
        btn.addEventListener('pointerup', onPointerUp);
        btn.addEventListener('pointercancel', onPointerUp);

        // 首次同步一次面板数据
        updatePanelDisplay();
    }

    // ========= 8. 全局 UI：状态栏 / 锁屏 / 设置里的“当前时间” =========
    function setupGlobalUIUpdater() {
        const statusBarTimeEl = document.getElementById('status-bar-time');
        const lockTimeEl = document.getElementById('lock-main-time');
        const lockDateEl = document.getElementById('lock-main-date');
        const apiTimeEl = document.getElementById('current-time-display');
        const apiTsEl = document.getElementById('current-timestamp-display');

        function updateUI() {
            const vDate = getVirtualDate();
            const h = pad2(vDate.getHours());
            const m = pad2(vDate.getMinutes());
            const s = pad2(vDate.getSeconds());
            const wd = WEEKDAYS[vDate.getDay()];
            const year = vDate.getFullYear();
            const month = vDate.getMonth() + 1;
            const day = vDate.getDate();

            // 状态栏时间：HH:MM
            if (statusBarTimeEl) {
                statusBarTimeEl.textContent = `${h}:${m}`;
            }

            // 锁屏时间 + 日期（带星期）
            if (lockTimeEl) {
                lockTimeEl.textContent = `${h}:${m}`;
            }
            if (lockDateEl) {
                lockDateEl.textContent = `星期${wd}, ${month}月${day}日`;
            }

            // 设置页里那块“当前时间（设备本地时间）” → 改成虚拟时间显示
            if (apiTimeEl) {
                apiTimeEl.textContent = `${year}-${pad2(month)}-${pad2(day)} (${wd}) ${h}:${m}:${s}`;
            }
            if (apiTsEl) {
                apiTsEl.textContent = `Unix 时间戳: ${Math.floor(getVirtualNow() / 1000)}`;
            }
        }

        // 每秒刷新一次
        updateUI();
        setInterval(updateUI, 1000);

        // 设置变化时立刻刷新一次
        VirtualClock.subscribe(updateUI);
    }

    // ========= 9. 初始化 =========
    function init() {
        createWidget();
        setupGlobalUIUpdater();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

