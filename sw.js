// Service Worker for PWA Notifications
// 用于在后台发送浏览器原生通知（支持 Push Notification）
// 兼容：Chrome, Edge, Firefox, Safari, Opera, 百度浏览器等主流浏览器

const CACHE_NAME = 'ephone-notification-v1';
const CACHE_VERSION = 'v1';

// 浏览器兼容性检测和降级处理
const isNotificationSupported = typeof self.Notification !== 'undefined';
const isPushManagerSupported = typeof self.PushManager !== 'undefined';
const isSyncManagerSupported = typeof self.sync !== 'undefined';

self.addEventListener('install', (event) => {
  console.log('Service Worker 安装中...', {
    notification: isNotificationSupported,
    pushManager: isPushManagerSupported,
    syncManager: isSyncManagerSupported,
    userAgent: self.navigator?.userAgent || 'unknown'
  });
  
  // 立即激活新的 Service Worker（兼容所有浏览器）
  if (typeof self.skipWaiting === 'function') {
    self.skipWaiting();
  }
  
  // 预缓存资源以确保离线可用（使用兼容性更好的方式）
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 使用 Promise.allSettled 确保部分失败不影响整体
      const urlsToCache = ['./', './index.html', './manifest.json'];
      const cachePromises = urlsToCache.map(url => {
        return cache.add(url).catch(err => {
          console.log('缓存资源失败:', url, err);
          return null; // 返回 null 而不是抛出错误
        });
      });
      
      // 如果浏览器不支持 Promise.allSettled，使用 Promise.all 配合 catch
      if (typeof Promise.allSettled === 'function') {
        return Promise.allSettled(cachePromises);
      } else {
        return Promise.all(cachePromises.map(p => p.catch(() => null)));
      }
    }).catch(err => {
      console.log('打开缓存失败:', err);
      // 即使缓存失败也继续安装
      return Promise.resolve();
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker 已激活');
  event.waitUntil(
    Promise.all([
      // 立即控制所有页面（兼容性处理）
      typeof self.clients !== 'undefined' && typeof self.clients.claim === 'function'
        ? self.clients.claim()
        : Promise.resolve(),
      // 清理旧缓存
      typeof caches !== 'undefined'
        ? caches.keys().then((cacheNames) => {
            return Promise.all(
              cacheNames.map((cacheName) => {
                if (cacheName !== CACHE_NAME) {
                  console.log('删除旧缓存:', cacheName);
                  return caches.delete(cacheName).catch(err => {
                    console.log('删除缓存失败:', cacheName, err);
                    return null;
                  });
                }
                return Promise.resolve();
              })
            );
          }).catch(err => {
            console.log('获取缓存列表失败:', err);
            return Promise.resolve();
          })
        : Promise.resolve()
    ])
  );
});

// 监听来自主线程的通知请求
self.addEventListener('message', (event) => {
  if (!event.data) return;
  
  // 显示通知（兼容所有浏览器）
  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    
    // 检查通知支持
    if (!isNotificationSupported) {
      console.warn('浏览器不支持通知功能');
      return;
    }
    
    // 构建通知选项（兼容不同浏览器）
    const notificationOptions = {
      badge: options.badge || 'https://i.postimg.cc/Kj8JnRcp/267611-CC01-F8-A3-B4910-A2-C2-FFDE479-DC.jpg',
      icon: options.icon || 'https://i.postimg.cc/Kj8JnRcp/267611-CC01-F8-A3-B4910-A2-C2-FFDE479-DC.jpg',
      tag: options.tag || 'ephone-notification',
      data: options.data || {}
    };
    
    // 可选属性（某些浏览器可能不支持）
    if (typeof options.requireInteraction !== 'undefined') {
      notificationOptions.requireInteraction = options.requireInteraction;
    }
    if (typeof options.silent !== 'undefined') {
      notificationOptions.silent = options.silent;
    }
    // vibrate 在某些浏览器中可能不支持
    if (typeof options.vibrate !== 'undefined' && 'vibrate' in Notification.prototype) {
      notificationOptions.vibrate = options.vibrate || [200, 100, 200];
    }
    
    // 合并用户提供的选项
    Object.assign(notificationOptions, options);
    
    event.waitUntil(
      self.registration.showNotification(title, notificationOptions).catch(err => {
        console.error('显示通知失败:', err);
      })
    );
  }
  
  // 处理推送订阅请求（仅支持 Push API 的浏览器）
  if (event.data.type === 'GET_SUBSCRIPTION') {
    if (!isPushManagerSupported) {
      console.warn('浏览器不支持 Push Manager');
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ subscription: null, error: 'Push Manager not supported' });
      }
      return;
    }
    
    event.waitUntil(
      self.registration.pushManager.getSubscription()
        .then((subscription) => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ subscription: subscription });
          }
        })
        .catch(err => {
          console.error('获取推送订阅失败:', err);
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ subscription: null, error: err.message });
          }
        })
    );
  }
});

// 处理 Push Notification 事件（真正的推送通知）
// 注意：Push API 需要 HTTPS 且不是所有浏览器都支持
self.addEventListener('push', (event) => {
  console.log('收到 Push 通知:', event);
  
  if (!isNotificationSupported) {
    console.warn('浏览器不支持通知，无法显示推送通知');
    return;
  }
  
  let notificationData = {
    title: '新消息',
    body: '您有一条新消息',
    icon: 'https://i.postimg.cc/Kj8JnRcp/267611-CC01-F8-A3-B4910-A2-C2-FFDE479-DC.jpg',
    badge: 'https://i.postimg.cc/Kj8JnRcp/267611-CC01-F8-A3-B4910-A2-C2-FFDE479-DC.jpg',
    tag: 'ephone-push-notification',
    data: {}
  };

  // 如果推送数据包含 JSON，解析它（兼容性处理）
  if (event.data) {
    try {
      // 检查是否有 json() 方法
      if (typeof event.data.json === 'function') {
        const data = event.data.json();
        notificationData = {
          ...notificationData,
          ...data,
          title: data.title || notificationData.title,
          body: data.body || notificationData.body,
          icon: data.icon || notificationData.icon,
          data: data.data || notificationData.data
        };
      } else if (typeof event.data.text === 'function') {
        // 尝试作为文本解析
        const text = event.data.text();
        try {
          const data = JSON.parse(text);
          notificationData = {
            ...notificationData,
            ...data,
            title: data.title || notificationData.title,
            body: data.body || notificationData.body,
            icon: data.icon || notificationData.icon,
            data: data.data || notificationData.data
          };
        } catch (e) {
          notificationData.body = text || notificationData.body;
        }
      }
    } catch (e) {
      console.error('解析推送数据失败:', e);
      // 如果解析失败，使用默认值
    }
  }
  
  // vibrate 属性（某些浏览器不支持）
  if ('vibrate' in Notification.prototype) {
    notificationData.vibrate = [200, 100, 200];
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
      .catch(err => {
        console.error('显示推送通知失败:', err);
      })
  );
});

// 后台同步 - 确保在后台也能发送通知和运行后台活动
// 注意：Background Sync API 不是所有浏览器都支持（Firefox 不支持）
if (isSyncManagerSupported) {
  self.addEventListener('sync', (event) => {
    console.log('后台同步事件:', event.tag);
    
    if (event.tag === 'send-notification') {
      event.waitUntil(
        // 这里可以添加需要后台同步的逻辑
        // 例如：发送待发送的通知
        Promise.resolve().catch(err => {
          console.error('后台同步失败:', err);
        })
      );
    } else if (event.tag === 'background-activity') {
      // 后台活动同步
      event.waitUntil(
        runBackgroundActivityInSW().catch(err => {
          console.error('后台活动同步失败:', err);
        })
      );
    } else if (event.tag === 'check-backend-messages') {
      // 检查后端消息
      event.waitUntil(
        checkBackendMessages().catch(err => {
          console.error('检查后端消息失败:', err);
        })
      );
    }
  });
} else {
  console.log('浏览器不支持 Background Sync API');
}

// Periodic Background Sync - 定期后台同步（更强大的后台运行能力）
// 注意：需要用户添加到主屏幕，且不是所有浏览器都支持
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', (event) => {
    console.log('定期后台同步事件:', event.tag);
    
    if (event.tag === 'background-activity-periodic') {
      event.waitUntil(
        runBackgroundActivityInSW().catch(err => {
          console.error('定期后台活动失败:', err);
        })
      );
    } else if (event.tag === 'check-backend-messages') {
      // 检查后端生成的消息
      event.waitUntil(
        checkBackendMessages().catch(err => {
          console.error('检查后端消息失败:', err);
        })
      );
    }
  });
} else {
  console.log('浏览器不支持 Periodic Background Sync API');
}

// 检查后端生成的消息（用于在网站关闭时也能收到通知）
let lastCheckedMessageIds = new Set();
let workerApiUrl = null;
let userId = null;

// 从主线程接收配置
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_BACKGROUND_CONFIG') {
    workerApiUrl = event.data.workerApiUrl;
    userId = event.data.userId;
    console.log('Service Worker: 收到后台活动配置', { workerApiUrl, userId });
  }
});

async function checkBackendMessages() {
  try {
    if (!workerApiUrl || !userId) {
      // 尝试从 IndexedDB 读取配置
      const db = await openIndexedDB();
      if (db) {
        const apiConfig = await getFromIndexedDB(db, 'apiConfig', 'apiConfig');
        if (apiConfig) {
          workerApiUrl = apiConfig.workerApiUrl || 'https://scheduled-messages-worker.wcl20091007.workers.dev';
          userId = apiConfig.scheduledUserId;
        }
      }
      
      if (!workerApiUrl || !userId) {
        console.log('Service Worker: 缺少配置，跳过检查');
        return;
      }
    }

    console.log('Service Worker: 检查后端消息...');

    // 检查定时消息
    const scheduledResponse = await fetch(
      `${workerApiUrl}/api/scheduled-messages?userId=${encodeURIComponent(userId)}&checkNew=true`
    );

    if (scheduledResponse.ok) {
      const scheduledResult = await scheduledResponse.json();
      if (scheduledResult.success && scheduledResult.messages && scheduledResult.messages.length > 0) {
        for (const msg of scheduledResult.messages) {
          if (!lastCheckedMessageIds.has(msg.id)) {
            lastCheckedMessageIds.add(msg.id);
            await showNotificationForMessage('定时消息', msg.content, msg.id);
          }
        }
      }
    }

    // 检查后台活动消息
    const bgResponse = await fetch(
      `${workerApiUrl}/api/background-activity/messages?userId=${encodeURIComponent(userId)}&checkNew=true`
    );

    if (bgResponse.ok) {
      const bgResult = await bgResponse.json();
      if (bgResult.success && bgResult.messages && bgResult.messages.length > 0) {
        for (const msg of bgResult.messages) {
          if (!lastCheckedMessageIds.has(`bg-${msg.id}`)) {
            lastCheckedMessageIds.add(`bg-${msg.id}`);
            await showNotificationForMessage(
              msg.chat_name || '角色消息',
              msg.content,
              `bg-${msg.id}`,
              msg.chat_id
            );
          }
        }
      }
    }

    // 清理旧的ID
    if (lastCheckedMessageIds.size > 100) {
      const idsArray = Array.from(lastCheckedMessageIds);
      lastCheckedMessageIds = new Set(idsArray.slice(-100));
    }

    console.log('Service Worker: 后端消息检查完成');
  } catch (error) {
    console.error('Service Worker: 检查后端消息时出错:', error);
  }
}

async function showNotificationForMessage(title, body, tag, chatId = null) {
  if (!isNotificationSupported) {
    console.warn('Service Worker: 浏览器不支持通知');
    return;
  }

  try {
    const notificationOptions = {
      body: body,
      icon: 'https://i.postimg.cc/Kj8JnRcp/267611-CC01-F8-A3-B4910-A2-C2-FFDE479-DC.jpg',
      badge: 'https://i.postimg.cc/Kj8JnRcp/267611-CC01-F8-A3-B4910-A2-C2-FFDE479-DC.jpg',
      tag: tag,
      data: {
        chatId: chatId,
        type: 'message',
        timestamp: Date.now()
      },
      requireInteraction: false,
      silent: false,
    };

    // 添加振动（如果支持）
    if ('vibrate' in Notification.prototype) {
      notificationOptions.vibrate = [200, 100, 200];
    }

    await self.registration.showNotification(title, notificationOptions);
    console.log(`Service Worker: 已显示通知 - ${title}`);
  } catch (error) {
    console.error('Service Worker: 显示通知失败:', error);
  }
}

// 在 Service Worker 中运行后台活动
async function runBackgroundActivityInSW() {
  try {
    console.log('Service Worker: 开始运行后台活动...');
    
    // 从 IndexedDB 读取配置和聊天数据
    // 注意：Service Worker 中需要使用 indexedDB API
    const db = await openIndexedDB();
    if (!db) {
      console.warn('Service Worker: 无法打开 IndexedDB');
      return;
    }

    // 读取全局设置
    const globalSettings = await getFromIndexedDB(db, 'globalSettings', 'global');
    if (!globalSettings || !globalSettings.enableBackgroundActivity) {
      console.log('Service Worker: 后台活动未启用');
      return;
    }

    // 读取所有聊天
    const allChats = await getAllFromIndexedDB(db, 'chats');
    const allSingleChats = allChats.filter(chat => !chat.isGroup);

    if (allSingleChats.length === 0) {
      console.log('Service Worker: 没有单聊角色，跳过本次检测。');
      return;
    }

    const frequencyProbabilities = {
      low: 0.3,
      medium: 0.5,
      high: 0.8,
    };

    const config = globalSettings.backgroundActivityConfig || {};
    const intervalSeconds = globalSettings.backgroundActivityInterval || 60;
    const minInterval = intervalSeconds * 1000;

    for (const chat of allSingleChats) {
      // 检查好友关系
      if (chat.relationship?.status === 'friend') {
        const frequency = config[chat.id];
        if (!frequency) continue;

        const probability = frequencyProbabilities[frequency];
        if (!probability) continue;

        // 检查距离上次活动的时间
        const lastActivityTimestamp = chat.settings?.backgroundActivity?.lastActivityTimestamp || 0;
        const timeSinceLastActivity = Date.now() - lastActivityTimestamp;
        
        if (timeSinceLastActivity < minInterval) {
          continue;
        }

        // 随机决定是否行动
        if (Math.random() < probability) {
          console.log(`Service Worker: 角色 "${chat.name}" 被唤醒，准备独立行动...`);
          
          // 更新最后活动时间戳
          if (!chat.settings) chat.settings = {};
          if (!chat.settings.backgroundActivity) chat.settings.backgroundActivity = {};
          chat.settings.backgroundActivity.lastActivityTimestamp = Date.now();
          
          // 保存到数据库
          await putToIndexedDB(db, 'chats', chat);
          
          // 通知主线程触发AI行动
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'TRIGGER_BACKGROUND_ACTIVITY',
              chatId: chat.id
            });
          });
          
          // 显示通知
          if (isNotificationSupported) {
            await self.registration.showNotification(
              `${chat.name} 正在思考...`,
              {
                body: '角色正在后台活动',
                icon: chat.settings?.aiAvatar || 'https://i.postimg.cc/Kj8JnRcp/267611-CC01-F8-A3-B4910-A2-C2-FFDE479-DC.jpg',
                tag: `bg-activity-${chat.id}`,
                silent: true, // 静默通知，不打扰用户
                data: { chatId: chat.id, type: 'background-activity' }
              }
            );
          }
        }
      }
    }

    console.log('Service Worker: 后台活动检查完成');
  } catch (error) {
    console.error('Service Worker: 后台活动运行失败:', error);
  }
}

// IndexedDB 辅助函数
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ephone-db', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // 创建对象存储（如果不存在）
      if (!db.objectStoreNames.contains('chats')) {
        db.createObjectStore('chats', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('globalSettings')) {
        db.createObjectStore('globalSettings', { keyPath: 'id' });
      }
    };
  });
}

function getFromIndexedDB(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getAllFromIndexedDB(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

function putToIndexedDB(db, storeName, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// 处理通知点击事件（兼容所有浏览器）
self.addEventListener('notificationclick', (event) => {
  console.log('通知被点击:', event.notification);
  
  // 关闭通知（兼容性处理）
  if (event.notification && typeof event.notification.close === 'function') {
    event.notification.close();
  }

  const notificationData = event.notification?.data || {};
  const chatId = notificationData.chatId;
  const notificationType = notificationData.type;

  // 打开或聚焦到应用（兼容性处理）
  event.waitUntil(
    (async () => {
      try {
        // 检查 clients API 支持
        if (typeof self.clients === 'undefined' || typeof self.clients.matchAll !== 'function') {
          console.warn('浏览器不支持 Clients API');
          return;
        }
        
        const clientList = await self.clients.matchAll({ 
          type: 'window', 
          includeUncontrolled: true 
        });
        
        // 如果已经有打开的窗口，聚焦它并发送消息
        for (let client of clientList) {
          const origin = self.location?.origin || '';
          if (client.url && client.url.includes(origin) && typeof client.focus === 'function') {
            // 根据通知类型发送不同的消息
            if (notificationType === 'kk-checkin-complete' && chatId) {
              // 查岗完成通知：打开查岗界面
              if (typeof client.postMessage === 'function') {
                client.postMessage({
                  type: 'OPEN_KK_CHECKIN',
                  charId: chatId
                });
              }
            } else if (chatId) {
              // 普通聊天通知：打开对应聊天
              if (typeof client.postMessage === 'function') {
                client.postMessage({
                  type: 'OPEN_CHAT',
                  chatId: chatId
                });
              }
            }
            return client.focus();
          }
        }
        
        // 如果没有打开的窗口，打开一个新窗口
        if (typeof self.clients.openWindow === 'function') {
          let url = '/';
          if (notificationType === 'kk-checkin-complete' && chatId) {
            url = `/?openKkCheckin=${chatId}`;
          } else if (chatId) {
            url = `/?openChat=${chatId}`;
          }
          return self.clients.openWindow(url);
        }
      } catch (err) {
        console.error('处理通知点击失败:', err);
      }
    })()
  );
});

