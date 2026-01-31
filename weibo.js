// weibo.js

// ===================================================================
// 1. Global variables for Weibo functionality
// ===================================================================
let currentViewingWeiboProfileId = null; // Global variable, records which character's homepage is being viewed
let currentHotTopic = ''; // Used to store the currently viewed hot search topic
let hotTopicFeedCache = {}; // Used to cache generated content
let weiboHotSearchCache = [];
let currentWeiboActionTarget = {}; // Used to store information about the target being operated on

// Variables for user's own DMs
let currentUserDmFanIndex = null; // Used to track which fan's DM is being viewed

// Variables for character DMs
let currentViewingDmsFor = null; // Used to track which character's DMs are being viewed

// ===================================================================
// 2. Weibo Function Definitions
// ===================================================================

/**
 * 【分组隔离】判断两个角色是否在同一分组
 * @param {string} charId1 - 第一个角色的ID（'user' 或角色ID）
 * @param {string} charId2 - 第二个角色的ID（'user' 或角色ID）
 * @returns {boolean} - 是否在同一分组
 */
function isInSameGroup(charId1, charId2) {
  // 用户（'user'）没有分组限制，可以看到所有内容
  if (charId1 === 'user' || charId2 === 'user') {
    return true;
  }
  
  // 获取两个角色的聊天对象
  const chat1 = state.chats[charId1];
  const chat2 = state.chats[charId2];
  
  // 如果任一角色不存在，返回 false
  if (!chat1 || !chat2) {
    return false;
  }
  
  // 获取两个角色的 groupId（如果不存在则为 undefined）
  const groupId1 = chat1.groupId;
  const groupId2 = chat2.groupId;
  
  // 如果两个角色都没有分组（groupId 为 undefined 或 null），则视为同一分组（默认可见）
  if (!groupId1 && !groupId2) {
    return true;
  }
  
  // 如果只有一个有分组，另一个没有，则不在同一分组
  if (!groupId1 || !groupId2) {
    return false;
  }
  
  // 两个角色都有分组，比较是否相同
  return groupId1 === groupId2;
}

/**
 * 【分组隔离】根据角色昵称查找角色ID并判断是否在同一分组
 * @param {string} viewerCharId - 查看者的角色ID（'user' 或角色ID）
 * @param {string} authorNickname - 作者昵称
 * @returns {boolean} - 是否在同一分组
 */
function canSeeByNickname(viewerCharId, authorNickname) {
  // 用户可以看到所有内容
  if (viewerCharId === 'user') {
    return true;
  }
  
  // 查找昵称对应的角色
  const authorChat = Object.values(state.chats).find(
    chat => !chat.isGroup && 
    (chat.settings.weiboNickname === authorNickname || chat.name === authorNickname)
  );
  
  // 如果找不到对应角色，返回 false
  if (!authorChat) {
    return false;
  }
  
  // 判断是否在同一分组
  return isInSameGroup(viewerCharId, authorChat.id);
}

/**
 * 【微博】总入口：根据当前激活的视图，渲染对应的微博Feed
 */
async function renderWeiboFeeds(viewId) {
  if (viewId === 'weibo-my-profile-view') {
    await renderMyWeiboFeed();
  } else if (viewId === 'weibo-following-view') {
    await renderFollowingWeiboFeed();
  }
}

/**
 * 【微博】渲染“我的主页”上的微博列表
 */
async function renderMyWeiboFeed() {
  const feedEl = document.getElementById('my-weibo-feed-list');
  const posts = await db.weiboPosts.where('authorId').equals('user').reverse().toArray();
  feedEl.innerHTML = '';
  if (posts.length === 0) {
    feedEl.innerHTML =
      '<p style="text-align:center; color: var(--text-secondary);">你还没有发过微博哦，点击右上角“+”试试吧！</p>';
    return;
  }
  posts.forEach(post => {
    // 【核心修改】调用我们新的专属函数！
    feedEl.appendChild(createWeiboPostElement(post));
  });
}

/**
 * 【微博】渲染“关注的人”的微博Feed (已修复卡顿问题)
 */
async function renderFollowingWeiboFeed() {
  const feedEl = document.getElementById('weibo-following-feed-list');

  // 【核心优化】我们不再一次性读取所有帖子，而是直接让数据库帮我们筛选和排序，速度会快很多！
  const posts = await db.weiboPosts
    .where('authorId')
    .notEqual('user') // 1. 直接在数据库层面，找出作者不是'user'的帖子
    .reverse() // 2. 让结果按倒序排列
    .sortBy('timestamp'); // 3. 根据时间戳排序

  // 后续的渲染逻辑保持不变
  feedEl.innerHTML = '';
  if (posts.length === 0) {
    feedEl.innerHTML =
      '<p style="text-align:center; color: var(--text-secondary);">你关注的人还没有发布任何动态哦。</p>';
    return;
  }
  posts.forEach(post => {
    const postElement = createWeiboPostElement(post, 'user');
    if (postElement) {
      feedEl.appendChild(postElement);
    }
  });
}
/**
 * 【修复】保存微博/动态设置到数据库
 * (修复 ReferenceError: saveQzoneSettings is not defined)
 */
async function saveQzoneSettings() {
  // 确保 db 和 state.qzoneSettings 都存在
  if (typeof db !== 'undefined' && state && state.qzoneSettings) {
    await db.qzoneSettings.put(state.qzoneSettings);
  }
}

/**
 * 【微博】创建微博帖子元素（支持分组隔离）
 * @param {Object} post - 微博帖子对象
 * @param {string} viewerCharId - 查看者的角色ID（'user' 或角色ID），默认为 'user'
 */
function createWeiboPostElement(post, viewerCharId = 'user') {
  const postEl = document.createElement('div');
  postEl.className = 'weibo-post-item';

  // 【分组隔离】检查查看者是否可以看到这个帖子
  // 如果帖子的作者是角色，需要检查是否在同一分组
  if (post.authorId !== 'user' && viewerCharId !== 'user') {
    if (!isInSameGroup(viewerCharId, post.authorId)) {
      // 不在同一分组，不显示这个帖子（但这里不应该到达，因为应该在调用前过滤）
      return null;
    }
  }

  let contentHtml = '';
  if (post.content) {
    contentHtml += `<div class="weibo-post-content">${post.content.replace(/\n/g, '<br>')}</div>`;
  }

  if (post.imageUrl) {
    if (post.postType === 'text_image') {
      contentHtml += `<img src="${post.imageUrl}" class="weibo-post-image" style="cursor: pointer;" data-hidden-text="${
        post.hiddenContent || ''
      }">`;
    } else {
      contentHtml += `<img src="${post.imageUrl}" class="weibo-post-image">`;
    }
  }

  let commentsHtml = '';
  if (post.comments && Array.isArray(post.comments) && post.comments.length > 0) {
    commentsHtml += '<div class="weibo-comments-container">';
    // 【分组隔离】过滤评论：只显示与查看者同分组的评论
    const visibleComments = post.comments.filter(comment => {
      if (typeof comment !== 'object' || comment === null) return false;
      // 用户可以看到所有评论
      if (viewerCharId === 'user') return true;
      // 检查评论者是否与查看者在同一分组
      return canSeeByNickname(viewerCharId, comment.authorNickname);
    });
    
    visibleComments.forEach(comment => {
      if (typeof comment !== 'object' || comment === null) return;
      let replyHtml = '';

      // ★ 修改1：为被回复者添加专属的 class 和 data 属性，方便我们精确点击
      if (comment.replyToNickname) {
        replyHtml = `<span class="weibo-comment-reply-tag">回复</span><span class="reply-target-name" data-reply-to-name="${comment.replyToNickname}">${comment.replyToNickname}</span>`;
      }

      commentsHtml += `
                <div class="weibo-comment-item" data-comment-id="${comment.commentId}" data-commenter-name="${comment.authorNickname}">
                    <span class="weibo-commenter-name">${comment.authorNickname}</span>
                    ${replyHtml}:
                    <span class="weibo-comment-text">${comment.commentText}</span>
                    <button class="comment-delete-btn" title="删除此条评论">×</button>
                </div>`;
    });
    commentsHtml += '</div>';
  }

  const myNickname = state.qzoneSettings.weiboNickname || state.qzoneSettings.nickname || '我';
  const isLiked = post.likes && post.likes.includes(myNickname);

  let finalAuthorAvatar, finalAuthorNickname, finalAuthorAvatarFrame;
  if (post.authorId === 'user') {
    finalAuthorAvatar = state.qzoneSettings.weiboAvatar || state.qzoneSettings.avatar || defaultAvatar;
    finalAuthorNickname = state.qzoneSettings.weiboNickname || state.qzoneSettings.nickname || '我';
    finalAuthorAvatarFrame = state.qzoneSettings.weiboAvatarFrame || '';
  } else if (state.chats[post.authorId]) {
    const authorChat = state.chats[post.authorId];
    finalAuthorNickname = authorChat.settings.weiboNickname || authorChat.name;
    finalAuthorAvatar = authorChat.settings.weiboAvatar || authorChat.settings.aiAvatar || defaultAvatar;
    finalAuthorAvatarFrame = authorChat.settings.weiboAvatarFrame || authorChat.settings.aiAvatarFrame || '';
  } else {
    finalAuthorAvatar = defaultAvatar;
    finalAuthorNickname = post.authorNickname || '未知用户';
    finalAuthorAvatarFrame = '';
  }

  let avatarHtml = '';
  if (finalAuthorAvatarFrame) {
    avatarHtml = `
            <div class="avatar-with-frame">
                <img src="${finalAuthorAvatar}" class="avatar-img weibo-post-avatar">
                <img src="${finalAuthorAvatarFrame}" class="avatar-frame">
            </div>`;
  } else {
    avatarHtml = `<img src="${finalAuthorAvatar}" class="weibo-post-avatar">`;
  }

  const clickableAvatarWrapper = `
        <div class="weibo-post-avatar-clickable" data-char-id="${post.authorId}">
            ${avatarHtml}
        </div>
    `;

  postEl.innerHTML = `
        <div class="weibo-post-header">
            ${clickableAvatarWrapper} 
            <div class="weibo-post-info">
                <span class="weibo-post-nickname">${finalAuthorNickname}</span>
                <span class="weibo-post-timestamp">${formatPostTimestamp(post.timestamp)}</span>
            </div>
            <div class="post-actions-btn" data-post-id="${post.id}" data-author-id="${post.authorId}">…</div>
        </div>
        ${contentHtml}
        <div class="weibo-post-footer">
            <div class="weibo-post-actions">
                <span class="weibo-action-btn like-btn ${isLiked ? 'liked' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                    <span>${(post.baseLikesCount || 0) + (post.likes || []).length}</span>
                </span>
                <span class="weibo-action-btn comment-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>           
                    <span>${(post.comments || []).length}</span>
                </span>
                <span class="weibo-action-btn generate-comments-btn" title="AI生成评论">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
                    </svg>
                    <span>生成评论</span>
                </span>
            </div>
            ${commentsHtml}
            <div class="weibo-comment-input-area">
                <input type="text" class="weibo-comment-input" placeholder="留下你的精彩评论吧...">
                <button class="weibo-comment-send-btn">发送</button>
            </div>
        </div>
    `;

  // 绑定发送评论按钮
  const sendBtn = postEl.querySelector('.weibo-comment-send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const input = postEl.querySelector('.weibo-comment-input');
      handleWeiboComment(post.id, input);
    });
  }

  // 绑定AI生成评论按钮
  const generateBtn = postEl.querySelector('.generate-comments-btn');
  if (generateBtn) {
    generateBtn.addEventListener('click', () => generateWeiboComments(post.id));
  }

  // 绑定点赞按钮
  const likeBtn = postEl.querySelector('.like-btn');
  if (likeBtn) {
    likeBtn.addEventListener('click', () => handleWeiboLike(post.id));
  }

  // ★ 修改2：为评论区绑定一个全新的、功能更强大的点击事件监听器
  const commentSection = postEl.querySelector('.weibo-comments-container');
  if (commentSection) {
    commentSection.addEventListener('click', e => {
      // 阻止事件冒泡，这是解决点击无效的核心！
      e.stopPropagation();

      const target = e.target;
      const commentItem = target.closest('.weibo-comment-item');
      if (!commentItem) return; // 如果点击的不是评论区，就什么也不做

      const input = postEl.querySelector('.weibo-comment-input');

      // 检查点击的是否是删除按钮
      if (target.closest('.comment-delete-btn')) {
        deleteWeiboComment(post.id, commentItem.dataset.commentId);
        return; // 删除后结束
      }

      let replyToName = '';
      const replyToId = commentItem.dataset.commentId;

      // ★ 修改3：新增逻辑，判断你点击的是谁
      if (target.classList.contains('reply-target-name')) {
        // 如果点击了“被回复者”的名字
        replyToName = target.dataset.replyToName;
      } else {
        // 否则，默认回复这条评论的作者
        replyToName = commentItem.dataset.commenterName;
      }

      // ★ 修改4：优化回复逻辑
      // 如果正在回复同一个人，则取消回复
      if (input.dataset.replyToId === replyToId && input.placeholder.includes(`@${replyToName}`)) {
        input.placeholder = '留下你的精彩评论吧...';
        delete input.dataset.replyToId;
        delete input.dataset.replyToNickname;
      } else {
        // 否则，设置为新的回复目标
        input.placeholder = `回复 @${replyToName}:`;
        input.dataset.replyToId = replyToId;
        input.dataset.replyToNickname = replyToName;
        input.focus();
      }
    });
  }

  return postEl;
}

/**
 * 【微博】打开微博发布/编辑模态框
 */
async function openWeiboPublisher() {
  const modal = document.getElementById('create-post-modal');

  modal.dataset.mode = 'weibo'; // 关键！标记为微博模式

  document.getElementById('create-post-modal-title').textContent = '发微博';
  document.getElementById('post-public-text').placeholder = '有什么新鲜事想分享给大家？';

  // 隐藏动态专属的控件
  document.getElementById('post-image-desc-group').style.display = 'none';
  document.getElementById('post-comments-toggle-group').style.display = 'none';

  document.getElementById('post-mode-switcher').style.display = 'flex'; // 微博也需要模式切换

  resetCreatePostModal();
  modal.classList.add('visible');
}

/**
 * 【全新】智能解析带“万”或“亿”的数字字符串
 * @param {string} str - 包含数字的字符串，例如 "30000", "3万", "1.5万"
 * @returns {number} - 解析后的纯数字
 */
function parseChineseNumber(str) {
  if (!str) return 0; // 安全检查

  str = String(str).trim().toLowerCase(); // 转换为小写字符串并去除空格

  let num = parseFloat(str); // 先尝试直接解析数字部分

  if (str.includes('万') || str.includes('w')) {
    // 如果包含“万”或“w”，则将数字部分乘以10000
    num = parseFloat(str) * 10000;
  } else if (str.includes('亿')) {
    // 如果包含“亿”，则乘以100000000
    num = parseFloat(str) * 100000000;
  }

  // 如果解析失败 (比如输入了纯文字)，返回0
  return isNaN(num) ? 0 : Math.floor(num); // 返回整数，确保结果干净
}

/**
 * 【微博 V3 - 粉丝数计算版】处理发布微博的核心函数
 */
async function handlePublishWeibo() {
  const modal = document.getElementById('create-post-modal');

  const mainContent = document.getElementById('post-public-text').value.trim();
  let imageUrl = '',
    hiddenContent = '',
    postType = 'text_only',
    imageDescription = '';

  const isImageModeActive = document.getElementById('image-mode-content').classList.contains('active');

  if (isImageModeActive) {
    // 【核心修复】我们现在通过检查预览容器是否可见，来判断用户是否真的上传了图片
    const hasImage = document.getElementById('post-image-preview-container').classList.contains('visible');

    if (hasImage) {
      imageUrl = document.getElementById('post-image-preview').src;
      postType = 'image';
      imageDescription = document.getElementById('post-image-description').value.trim();
      // 图片描述的检查逻辑保持不变
      if (!imageDescription) {
        alert('为了让AI能看懂图片，请务必填写图片描述哦！');
        return;
      }
    }
    // 如果 hasImage 是 false (即用户只想发纯文字)，这段代码就会被跳过，imageUrl 保持为空，postType 保持为 text_only
  } else {
    // 文字图模式的逻辑保持不变
    hiddenContent = document.getElementById('post-hidden-text').value.trim();
    if (hiddenContent) {
      imageUrl = 'https://i.postimg.cc/KYr2qRCK/1.jpg';
      postType = 'text_image';
    }
  }

  if (!mainContent && !imageUrl) {
    alert('微博内容不能为空哦！');
    return;
  }

  const fansCount = parseChineseNumber(state.qzoneSettings.weiboFansCount) || 0;
  const baseLikes = Math.floor(fansCount * (Math.random() * 0.1 + 0.1));
  const baseComments = Math.floor(baseLikes * (Math.random() * 0.1 + 0.05));

  const newPost = {
    authorId: 'user',
    authorType: 'user',
    authorNickname: state.qzoneSettings.weiboNickname || state.qzoneSettings.nickname || '我',
    authorAvatar: state.qzoneSettings.weiboAvatar || state.qzoneSettings.avatar || defaultAvatar,
    content: mainContent,
    imageUrl: imageUrl,
    authorAvatarFrame: state.qzoneSettings.weiboAvatarFrame || '',
    imageDescription: imageDescription,
    hiddenContent: hiddenContent,
    postType: postType,
    timestamp: Date.now(),
    likes: [],
    comments: [],
    baseLikesCount: baseLikes,
    baseCommentsCount: baseComments,
  };

  await db.weiboPosts.add(newPost);
  await renderMyWeiboFeed();
  await renderWeiboProfile();

  modal.classList.remove('visible');
  alert('微博发布成功！');
}

/**
 * 【微博】处理点赞/取消点赞
 * @param {number} postId - 帖子ID
 */
async function handleWeiboLike(postId) {
  const post = await db.weiboPosts.get(postId);
  if (!post) return;

  const myNickname = state.qzoneSettings.nickname || '我';
  if (!post.likes) post.likes = [];

  const likeIndex = post.likes.indexOf(myNickname);
  if (likeIndex > -1) {
    post.likes.splice(likeIndex, 1); // 取消点赞
  } else {
    post.likes.push(myNickname); // 点赞
  }

  await db.weiboPosts.put(post);
  // 重新渲染两个Feed，确保数据同步
  await renderMyWeiboFeed();
  await renderFollowingWeiboFeed();
}

/**
 * 【微博】处理发布评论或回复
 * @param {number} postId - 帖子ID
 * @param {HTMLInputElement} inputElement - 评论输入框元素
 */
async function handleWeiboComment(postId, inputElement) {
  const commentText = inputElement.value.trim();
  if (!commentText) {
    alert('评论内容不能为空！');
    return;
  }

  const post = await db.weiboPosts.get(postId);
  if (!post) return;

  if (!post.comments) post.comments = [];

  const newComment = {
    commentId: 'comment_' + Date.now(),
    authorId: 'user',
    authorNickname: state.qzoneSettings.weiboNickname || state.qzoneSettings.nickname || '我',
    commentText: commentText,
    timestamp: Date.now(),
  };

  // 检查是否是回复
  if (inputElement.dataset.replyToId) {
    newComment.replyToId = inputElement.dataset.replyToId;
    newComment.replyToNickname = inputElement.dataset.replyToNickname;
  }

  post.comments.push(newComment);
  await db.weiboPosts.put(post);

  // 清空输入框并重置状态
  inputElement.value = '';
  inputElement.placeholder = '留下你的精彩评论吧...';
  delete inputElement.dataset.replyToId;
  delete inputElement.dataset.replyToNickname;

  // 重新渲染两个Feed
  await renderMyWeiboFeed();
  await renderFollowingWeiboFeed();
}

/**
 * 【全新】微博用户人设与职业设置核心功能
 */
function openWeiboUserSettingsModal() {
  const modal = document.getElementById('weibo-user-settings-modal');
  const settings = state.qzoneSettings;

  // 加载当前数据到输入框
  document.getElementById('weibo-user-profession-modal-input').value =
    settings.weiboUserProfession === '点击设置职业' ? '' : settings.weiboUserProfession;
  document.getElementById('weibo-user-persona-modal-input').value = settings.weiboUserPersona;

  renderWeiboUserPresetSelector(); // 渲染预设下拉框
  modal.classList.add('visible');
}

async function saveWeiboUserSettings() {
  const profession = document.getElementById('weibo-user-profession-modal-input').value.trim();
  const persona = document.getElementById('weibo-user-persona-modal-input').value.trim();

  state.qzoneSettings.weiboUserProfession = profession || '点击设置职业';
  state.qzoneSettings.weiboUserPersona = persona || '一个普通的微博用户。';

  await saveQzoneSettings(); // 保存到数据库
  await renderWeiboProfile(); // 刷新主页显示
  document.getElementById('weibo-user-settings-modal').classList.remove('visible');
  alert('微博设定已保存！');
}

function renderWeiboUserPresetSelector() {
  const select = document.getElementById('weibo-user-preset-select');
  const presets = state.qzoneSettings.weiboUserPersonaPresets || [];
  select.innerHTML = '<option value="">-- 选择预设 --</option>';
  presets.forEach((preset, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = preset.name;
    select.appendChild(option);
  });
}

function handleWeiboUserPresetSelection() {
  const select = document.getElementById('weibo-user-preset-select');
  const presets = state.qzoneSettings.weiboUserPersonaPresets || [];
  const selectedIndex = select.value;

  if (selectedIndex !== '') {
    const preset = presets[parseInt(selectedIndex)];
    document.getElementById('weibo-user-profession-modal-input').value = preset.profession;
    document.getElementById('weibo-user-persona-modal-input').value = preset.persona;
  }
}

async function openWeiboUserPresetManager() {
  const choice = await showChoiceModal('管理预设', [
    { text: '💾 保存当前为新预设', value: 'save' },
    { text: '🗑️ 删除已选预设', value: 'delete' },
  ]);

  if (choice === 'save') {
    const name = await showCustomPrompt('保存预设', '请输入预设名称');
    if (name && name.trim()) {
      const newPreset = {
        name: name.trim(),
        profession: document.getElementById('weibo-user-profession-modal-input').value.trim(),
        persona: document.getElementById('weibo-user-persona-modal-input').value.trim(),
      };
      if (!state.qzoneSettings.weiboUserPersonaPresets) state.qzoneSettings.weiboUserPersonaPresets = [];
      state.qzoneSettings.weiboUserPersonaPresets.push(newPreset);
      await saveQzoneSettings();
      renderWeiboUserPresetSelector();
      alert(`预设 "${name.trim()}" 已保存！`);
    }
  } else if (choice === 'delete') {
    const select = document.getElementById('weibo-user-preset-select');
    const selectedIndex = select.value;
    if (selectedIndex === '') {
      alert('请先从下拉框中选择一个要删除的预设。');
      return;
    }
    const presets = state.qzoneSettings.weiboUserPersonaPresets;
    const presetName = presets[parseInt(selectedIndex)].name;
    const confirmed = await showCustomConfirm('确认删除', `确定要删除预设 "${presetName}" 吗？`, {
      confirmButtonClass: 'btn-danger',
    });
    if (confirmed) {
      presets.splice(parseInt(selectedIndex), 1);
      await saveQzoneSettings();
      renderWeiboUserPresetSelector();
      alert('预设已删除。');
    }
  }
}

/**
 * 【全新】清空所有已关注角色的微博帖子
 */
async function clearFollowingFeed() {
  // 1. 弹出确认框，防止误操作
  const confirmed = await showCustomConfirm(
    '确认清空',
    '此操作将永久删除所有【非你本人发布】的微博，且无法恢复。确定要继续吗？',
    { confirmButtonClass: 'btn-danger' }, // 红色按钮以示警告
  );

  if (!confirmed) {
    return; // 如果用户取消，则不执行任何操作
  }

  try {
    // 2. 从数据库中找出所有作者不是'user'的帖子
    const postsToDelete = await db.weiboPosts.where('authorId').notEqual('user').toArray();
    const idsToDelete = postsToDelete.map(p => p.id);

    if (idsToDelete.length === 0) {
      alert('目前没有可以清空的动态。');
      return;
    }

    // 3. 批量删除这些帖子
    await db.weiboPosts.bulkDelete(idsToDelete);

    // 4. 重新渲染“关注的人”的Feed，让界面变空
    await renderWeiboFeeds('weibo-following-view');

    alert(`已成功清空 ${idsToDelete.length} 条动态！`);
  } catch (error) {
    console.error('清空关注动态时出错:', error);
    alert(`操作失败: ${error.message}`);
  }
}

/**
 * 【全新】显示微博主页并渲染数据
 */
async function showWeiboScreen() {
  // 1. 计算关注数
  const allSingleChats = Object.values(state.chats).filter(chat => !chat.isGroup);
  let totalNpcCount = 0;
  for (const chat of allSingleChats) {
    // 【NPC库优化】从全局NPC库获取启用的NPC
    let npcCount = 0;
    if (typeof getEnabledNpcs === 'function') {
      const npcs = await getEnabledNpcs(chat);
      npcCount = npcs.length;
    } else if (chat.enabledNpcIds && chat.enabledNpcIds.length > 0) {
      npcCount = chat.enabledNpcIds.length;
    }
    totalNpcCount += npcCount;
  }
  const followingCount = allSingleChats.length + totalNpcCount;

  // 2. 更新页面上的元素
  // 从你的“动态(QZone)”设置里获取头像和昵称，保持统一
  document.getElementById('weibo-avatar-img').src = state.qzoneSettings.avatar || defaultAvatar;
  document.getElementById('weibo-nickname').textContent = state.qzoneSettings.nickname || '你的昵称';
  document.getElementById('weibo-following-count').textContent = followingCount;

  // 3. 显示微博页面
  showScreen('weibo-screen');
}

/**
 * 【微博专属】渲染微博个人主页的所有数据
 */
async function renderWeiboProfile() {
  const settings = state.qzoneSettings || {};
  // 【核心】所有数据都从 weibo... 字段读取！
  // 添加安全检查，确保DOM元素存在
  const avatarImg = document.getElementById('weibo-avatar-img');
  const nicknameEl = document.getElementById('weibo-nickname');
  const fansCountEl = document.getElementById('weibo-fans-count');
  const backgroundImg = document.getElementById('weibo-background-img');
  
  if (avatarImg) avatarImg.src = settings.weiboAvatar || avatarImg.src;
  if (nicknameEl) nicknameEl.textContent = settings.weiboNickname || '你的昵称';
  if (fansCountEl) fansCountEl.textContent = settings.weiboFansCount || '0';
  if (backgroundImg) backgroundImg.src = settings.weiboBackground || backgroundImg.src;

  // 动态计算关注数 (使用全局NPC库)
  const allSingleChats = Object.values(state.chats).filter(chat => !chat.isGroup);
  let totalNpcCount = 0;
  for (const chat of allSingleChats) {
    // 【NPC库优化】从全局NPC库获取启用的NPC
    let npcCount = 0;
    if (typeof getEnabledNpcs === 'function') {
      const npcs = await getEnabledNpcs(chat);
      npcCount = npcs.length;
    } else if (chat.enabledNpcIds && chat.enabledNpcIds.length > 0) {
      npcCount = chat.enabledNpcIds.length;
    }
    totalNpcCount += npcCount;
  }
  const followingCountEl = document.getElementById('weibo-following-count');
  if (followingCountEl) {
    followingCountEl.textContent = allSingleChats.length + totalNpcCount;
  }

  // 动态计算微博数
  const postsCount = await db.weiboPosts.where('authorId').equals('user').count();
  const postsCountEl = document.getElementById('weibo-posts-count');
  if (postsCountEl) {
    postsCountEl.textContent = postsCount;
  }

  const professionEl = document.getElementById('weibo-user-profession-display');
  if (professionEl) {
    professionEl.textContent = settings.weiboUserProfession || '点击设置职业';
  }

  // --- ▼▼▼ 以下是本次新增的核心代码 ▼▼▼ ---
  // 1. 获取保存的头像框URL
  const frameUrl = settings.weiboAvatarFrame || '';
  // 2. 找到头像框的img元素
  const frameImg = document.getElementById('weibo-avatar-frame');
  if (frameImg) {
    // 3. 如果URL存在，就显示它
    if (frameUrl) {
      frameImg.src = frameUrl;
      frameImg.style.display = 'block';
    } else {
      // 4. 如果URL为空（即选择了“无”），就隐藏它
      frameImg.src = '';
      frameImg.style.display = 'none';
    }
  }
  // --- ▲▲▲ 新增代码结束 ▲▲▲
}

/**
 * 通用的图片编辑函数 (本地上传或URL)
 * @param {string} title - 弹窗标题
 * @param {string} currentUrl - 当前的图片URL
 * @returns {Promise<string|null>} - 新的图片URL或null
 */
async function getNewImageUrl(title, currentUrl) {
  const choice = await showChoiceModal(title, [
    { text: '📁 从本地上传', value: 'local' },
    { text: '🌐 使用网络URL', value: 'url' },
  ]);

  if (choice === 'local') {
    return await uploadImageLocally();
  } else if (choice === 'url') {
    const url = await showCustomPrompt(title, '请输入新的图片URL', currentUrl, 'url');
    if (url && url.trim().startsWith('http')) {
      return url.trim();
    } else if (url !== null) {
      alert('请输入一个有效的URL！');
    }
  }
  return null;
}

/**
 * 【微博专属】编辑微博头像
 */
async function editWeiboAvatar() {
  const newAvatarUrl = await getNewImageUrl('更换微博头像', state.qzoneSettings.weiboAvatar);
  if (newAvatarUrl) {
    state.qzoneSettings.weiboAvatar = newAvatarUrl; // 只修改微博头像
    await saveQzoneSettings();
    await renderWeiboProfile(); // 用专属函数刷新
  }
}

/**
 * 【微博专属】编辑微博背景图
 */
async function editWeiboBackground() {
  const newBgUrl = await getNewImageUrl('更换微博背景', state.qzoneSettings.weiboBackground);
  if (newBgUrl) {
    state.qzoneSettings.weiboBackground = newBgUrl; // 只修改微博背景
    await saveQzoneSettings();
    await renderWeiboProfile();
  }
}

/**
 * 【微博专属】编辑微博昵称
 */
async function editWeiboNickname() {
  const newNickname = await showCustomPrompt('编辑微博昵称', '请输入新的昵称', state.qzoneSettings.weiboNickname);
  if (newNickname !== null) {
    state.qzoneSettings.weiboNickname = newNickname.trim() || '你的昵称'; // 只修改微博昵称
    await saveQzoneSettings();
    await renderWeiboProfile();
  }
}

/**
 * 【微博专属】编辑微博粉丝数 (已修复，支持汉字)
 */
async function editWeiboFansCount() {
  // 核心修改：确保这里的第四个参数是 "text"，而不是 "number"
  const newFans = await showCustomPrompt('编辑粉丝数', '请输入新的粉丝数', state.qzoneSettings.weiboFansCount, 'text');

  if (newFans !== null) {
    state.qzoneSettings.weiboFansCount = newFans.trim() || '0'; // 只修改微博粉丝数
    await saveQzoneSettings();
    await renderWeiboProfile();
  }
}

/**
 * 【全新】切换微博主界面中的不同页面视图
 * @param {string} viewId - 要切换到的视图的ID
 */
async function switchToWeiboView(viewId) {
  // 1. 隐藏所有微博页面
  document.querySelectorAll('.weibo-view').forEach(view => {
    view.style.display = 'none'; // 使用 style.display 确保隐藏
  });

  // 2. 显示目标页面
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.style.display = 'flex'; // 使用 flex 显示
  }

  // 3. 更新底部导航栏的高亮状态
  document.querySelectorAll('.weibo-nav-item').forEach(item => {
    item.classList.remove('active');
  });
  const targetNavItem = document.querySelector(`.weibo-nav-item[data-view="${viewId}"]`);
  if (targetNavItem) {
    targetNavItem.classList.add('active');
  }

  // --- ▼▼▼【核心修复】▼▼▼ ---
  // 4. 根据你点击的页签，去加载并显示对应的微博内容
  if (viewId === 'weibo-following-view') {
    // 如果是“关注的人”页，就调用渲染关注列表的函数
    await renderFollowingWeiboFeed();
  } else if (viewId === 'weibo-my-profile-view') {
    // 如果是“我的微博”页，就调用渲染“我”的微博的函数
    await renderMyWeiboFeed();
  }
  // --- ▲▲▲【修复结束】▲▲▲ ---
}

function resetCreatePostModal() {
  document.getElementById('post-public-text').value = '';
  document.getElementById('post-image-preview').src = '';
  document.getElementById('post-image-description').value = '';
  document.getElementById('post-image-preview-container').classList.remove('visible');
  document.getElementById('post-image-desc-group').style.display = 'none';
  document.getElementById('post-local-image-input').value = '';
  document.getElementById('post-hidden-text').value = '';

  // 【核心修复】我们不再模拟点击，而是直接、安全地设置状态
  const imageModeBtn = document.getElementById('switch-to-image-mode');
  const textImageModeBtn = document.getElementById('switch-to-text-image-mode');
  const imageModeContent = document.getElementById('image-mode-content');
  const textImageModeContent = document.getElementById('text-image-mode-content');

  imageModeBtn.classList.add('active');
  textImageModeBtn.classList.remove('active');
  imageModeContent.classList.add('active');
  textImageModeContent.classList.remove('active');
}

function openWeiboPublisherClean() {
  // 1. 重置并获取模态框
  resetCreatePostModal();
  const modal = document.getElementById('create-post-modal');

  // 2. 设置为“微博”模式，并修改标题和提示语
  modal.dataset.mode = 'weibo';
  document.getElementById('create-post-modal-title').textContent = '发微博';
  document.getElementById('post-public-text').placeholder = '有什么新鲜事想分享给大家？';

  // 3. 确保所有“动态”专属的HTML元素都被隐藏
  const imageDescGroup = document.getElementById('post-image-desc-group');
  if (imageDescGroup) imageDescGroup.style.display = 'none';

  const commentsToggleGroup = document.getElementById('post-comments-toggle-group');
  if (commentsToggleGroup) commentsToggleGroup.style.display = 'none';

  const visibilityGroup = document.getElementById('post-visibility-group');
  if (visibilityGroup) visibilityGroup.style.display = 'none';

  // 4. 显示微博需要的控件
  const modeSwitcher = document.getElementById('post-mode-switcher');
  if (modeSwitcher) modeSwitcher.style.display = 'flex';

  // 5. 显示弹窗
  modal.classList.add('visible');
}

/**
 * 【总入口 V3 - 已支持多角色选择】生成微博热搜列表
 * @param {Array|string} targets - 目标角色ID数组或字符串'all'
 */
async function generateHotSearch(targets = 'all') {
  // 根据 targets 类型显示不同的提示
  if (targets === 'all') {
    await showCustomAlert('请稍候...', '正在生成微博热搜环境...');
  } else {
    await showCustomAlert('请稍候...', '正在结合角色人设和最近帖子生成微博热搜...');
  }

  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) {
    alert('请先配置API！');
    return;
  }

  let publicFiguresContext = '';
  let promptTask = '你的任务是根据下方提供的“核心参考人物”信息，为他们量身打造一个包含10个热搜话题的榜单。';

  let publicFigures = [];
  // 【修复】获取最近24小时内的帖子（所有角色和用户的）
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  let recentPosts = await db.weiboPosts
    .where('timestamp')
    .above(oneDayAgo)
    .reverse()
    .limit(50)
    .toArray();

  // 如果最近24小时没有帖子，获取最近10条帖子
  if (recentPosts.length === 0) {
    recentPosts = await db.weiboPosts.orderBy('timestamp').reverse().limit(10).toArray();
  }

  // 构建相关帖子ID集合
  let relevantPostIds = new Set();
  if (targets === 'all') {
    // 随机选择：包含所有角色和用户
    Object.values(state.chats)
      .filter(chat => !chat.isGroup)
      .forEach(chat => {
        relevantPostIds.add(chat.id);
        publicFigures.push({ name: chat.name, persona: chat.settings.aiPersona.substring(0, 150) + '...' });
      });
    relevantPostIds.add('user'); // 包含用户帖子
    promptTask = '你的任务是生成一个真实的、正式的微博热搜榜单，包含20个热搜话题。这个榜单应该模拟真实的微博热搜环境，包括社会新闻、经济环境、科技产品、体育赛事、娱乐新闻等各种类型的内容。同时，也要考虑下方"核心参考人物"和"最近帖子"的影响，如果有爆点帖子，可以围绕爆点生成相关热搜，但也要混合其他类型的热搜，确保榜单真实、丰富、多样化。';
  } else if (Array.isArray(targets)) {
    targets.forEach(chatId => {
      const char = state.chats[chatId];
      if (char) {
        publicFigures.push({ name: char.name, persona: char.settings.aiPersona.substring(0, 150) + '...' });
      }
    });
    if (publicFigures.length === 1) {
      promptTask = `你的任务是只为下方唯一的“核心参考人物”【${publicFigures[0].name}】，量身打造一个包含10个热搜话题的榜单。所有话题【必须】与Ta强相关。`;
    }
  }

  // 构建相关帖子ID集合（指定角色模式需要添加指定角色）
  if (Array.isArray(targets)) {
    // 确保指定角色也被添加到 relevantPostIds 中
    targets.forEach(id => relevantPostIds.add(id));
    relevantPostIds.add('user'); // 包含用户帖子
  }

  // 筛选出相关角色的帖子和用户帖子
  const relevantPosts = recentPosts
    .filter(post => relevantPostIds.has(post.authorId))
    .map(post => ({
      authorId: post.authorId,
      authorNickname: post.authorNickname || '未知',
      content: (post.content || '').substring(0, 200),
      timestamp: post.timestamp,
      likes: (post.likes || []).length + (post.baseLikesCount || 0),
      comments: (post.comments || []).length + (post.baseCommentsCount || 0),
    }))
    .slice(0, 20);

  // 构建最近帖子上下文
  const recentPostsContext =
    relevantPosts.length > 0
      ? `# 最近帖子 (角色和用户最近发布的微博，这些可能是热搜的"诱因爆炸点")\n${JSON.stringify(relevantPosts, null, 2)}\n\n**重要提示**: 请仔细分析这些帖子，判断是否有"爆点"（例如：恋情官宣、争议言论、重大动态等）。如果有爆点，就围绕爆点生成相关热搜；如果没有爆点，就按正常方式生成热搜。`
      : '';

  // 构建核心参考人物上下文
  publicFiguresContext =
    publicFigures.length > 0
      ? `# 核心参考人物 (你需要考虑他们的影响，${targets === 'all' ? '但也要混合其他类型的热搜，确保榜单真实、丰富、多样化' : '需要生成更多和角色相关的内容，同时也要混合其他类型的热搜，确保榜单真实、丰富、多样化'})\n${JSON.stringify(publicFigures, null, 2)}`
      : '';

  // 后续的 systemPrompt 和 API 调用逻辑与你现有代码完全相同，无需修改...
  const systemPrompt = `
# 任务
你是一个专业的“微博热搜榜单生成器”。${promptTask}
# 【【【核心原则：严格遵循人设】】】
${publicFiguresContext ? `1.  **人设至上**: 你必须【严格遵循】"核心参考人物"的人设信息。如果人设中明确写了两个角色是情侣、恋人、夫妻等关系，那就必须按照这个关系来生成内容。如果人设中写的是好朋友，那就只能是好朋友。
2.  **禁止杜撰关系**: 绝对禁止【私自创作】人设中没有明确说明的角色关系。你只能根据提供的人设信息进行合理发挥，不能自行添加或修改角色之间的关系。
3.  **人设一致性**: 所有生成的热搜话题如果涉及"核心参考人物"列表中的角色，必须符合他们的身份、职业、性格等人设特征，不能出现与人设矛盾的内容。` : ''}

# 【【【热搜生成的核心机制：诱因爆炸点】】】
微博热搜不是凭空产生的，它们都有"诱因爆炸点"！你需要理解以下真实场景：

**典型爆炸点示例：**
- **恋情官宣**: 明星/公众人物发布恋情官宣微博 → 粉丝爆炸 → 话题瞬间冲上热搜第一 → 相关话题（如"XXX恋情"、"XXX女友"、"XXX官宣"）同时上榜
- **争议事件**: 某角色发布争议性言论或行为 → 网友热议 → 话题发酵 → 多个相关热搜同时出现
- **重大动态**: 角色发布新作品、获奖、参加活动等 → 粉丝庆祝 → 媒体转发 → 话题热度飙升
- **突发事件**: 角色遭遇意外、卷入事件等 → 网友关注 → 话题快速传播

**生成策略：**
1.  **优先检查最近帖子**: ${recentPostsContext ? '首先查看下方"最近帖子"部分，判断是否有明显的"爆点"帖子（例如：恋情官宣、争议言论、重大动态等）' : '如果没有最近帖子，则按正常方式生成热搜'}
2.  **如果有爆点**: 
   - ${targets === 'all' ? '围绕爆点生成3-5个相关热搜' : '围绕爆点生成5-8个相关热搜（指定角色模式需要生成更多和角色相关的内容）'}（例如"XXX官宣恋情"会带动"XXX女友是谁"、"XXX粉丝反应"、"XXX前女友"等相关话题）
   - 其余热搜生成其他类型的内容（社会新闻、经济、科技、体育、娱乐等），确保榜单真实、丰富、多样化
3.  **如果没有爆点**: 
   - ${targets === 'all' ? '生成3-7个与角色相关的常规话题（根据角色人设、职业、身份等）' : '生成5-8个与（指定角色模式需要生成更多和角色相关的内容，根据角色人设、职业、身份等）'}
   - 其余热搜生成各种类型的内容，模拟真实的热搜环境：
     * 社会新闻（3-5个）：社会事件、民生话题、政策法规等
     * 经济环境（2-3个）：股市、经济政策、企业动态等
     * 科技产品（2-3个）：新手机发布、电子产品、科技公司动态等
     * 体育赛事（2-3个）：比赛结果、运动员动态等
     * 娱乐新闻（2-3个）：明星动态、影视作品、综艺节目等
     * 其他热点（2-3个）：天气、美食、旅游、教育、健康等生活化话题
   - 确保总共生成20个热搜话题，榜单看起来真实、丰富、多样化
4.  **热度分布**: 主要话题热度最高（300-800万），一般话题热度递减（50-300万），形成真实的热搜榜单分布
5.  **时间线逻辑**: 如果有爆点，热搜榜单应该反映事件的发展过程，例如先有"XXX疑似恋情"，然后"XXX官宣"，最后"XXX粉丝祝福"

# 核心规则
1.  **强相关性**: 生成的话题【必须】与“核心参考人物”的身份、职业、人设高度相关。例如，如果是电竞选手，热搜就应该是关于比赛、转会、退役等；如果是演员，就应该是关于新剧、获奖、绯闻等。
2.  **内容比例分配**（总共20个热搜）:
   - ${targets === 'all' ? '如果有爆点帖子：围绕爆点生成8-12个相关热搜，其余8-12个为其他类型的热搜（角色相关的常规话题、社会新闻、经济、科技、体育、娱乐等）' : '如果有爆点帖子：围绕爆点生成8-12个相关热搜（指定角色模式需要生成更多和角色相关的内容），其余8-12个为其他类型的热搜（角色相关的常规话题、社会新闻、经济、科技、体育、娱乐等）'}
   - ${targets === 'all' ? '如果没有爆点：生成10-14与角色相关的常规话题，其余6-8个为其他类型的热搜（社会新闻、经济、科技、体育、娱乐等）' : '如果没有爆点：生成10-15个与角色相关的常规话题（指定角色模式需要生成更多和角色相关的内容），其余为其他类型的热搜（社会新闻、经济、科技、体育、娱乐等）'}
   - 确保总共生成20个热搜话题，榜单看起来真实、丰富、多样化

3.  **【【【严禁杜撰】】】**: 如果生成的内容提到了"核心参考人物"列表中的角色，绝对禁止为他们【凭空捏造】人设中没有的职业、身份或背景。你只能根据提供的人设进行合理发挥。

4.  **真实感**: 生成的热搜应该模拟真实微博热搜的特点：
   - 话题标题要吸引人，符合微博用户的表达习惯
   - 热度值要合理分布（主要话题300-800万，一般话题50-300万）
   - 标签要符合话题性质（"热"表示热门话题，"新"表示新话题，"荐"表示推荐话题）
5.  **格式铁律**: 你的回复【必须且只能】是一个严格的JSON数组，数组中包含20个对象。每个对象【必须】包含以下三个字段:
    -   \`"topic"\`: (字符串) 热搜的话题，必须用"#"符号包裹。
    -   \`"heat"\`: (字符串) 热度值，例如 "345.6万"、"128.3万"。主要话题热度应更高（300-800万），一般话题热度递减（50-300万）。
    -   \`"tag"\`: (字符串) 一个标签，必须从 "热"、"新"、"荐" 中选择一个。

${recentPostsContext}

${publicFiguresContext}
`;
  try {
    let isGemini = proxyUrl === GEMINI_API_URL;
    let messagesForApi = [{ role: 'user', content: systemPrompt }];
    let geminiConfig = toGeminiRequestData(
      model,
      apiKey,
      systemPrompt,
      messagesForApi,
      isGemini,
      state.apiConfig.temperature,
    );
    const response = await fetch(
      isGemini ? geminiConfig.url : `${proxyUrl}/v1/chat/completions`,
      isGemini
        ? geminiConfig.data
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              messages: messagesForApi,
              temperature: parseFloat(state.apiConfig.temperature) || 0.8,
              response_format: { type: 'json_object' },
            }),
          },
    );
    if (!response.ok) throw new Error(`API请求失败: ${response.status} - ${await response.text()}`);
    const data = await response.json();
    const aiResponseContent = isGemini
      ? data.candidates?.[0]?.content?.parts?.[0]?.text
      : data.choices?.[0]?.message?.content;
    if (!aiResponseContent) {
      throw new Error('API返回了空内容，可能被安全策略拦截。请检查Prompt或更换模型。');
    }
    const sanitizedContent = aiResponseContent.replace(/^```json\s*|```$/g, '').trim();
    const responseData = JSON.parse(sanitizedContent);
    const hotSearchData = responseData.hot_searches || responseData;
    weiboHotSearchCache = hotSearchData;
    await generatePlazaFeed(hotSearchData, targets);
    renderHotSearchList(hotSearchData);
    await showCustomAlert('操作成功', '热搜榜和广场均已生成完毕！');
  } catch (error) {
    console.error('生成热搜失败:', error);
    await showCustomAlert('生成失败', `发生了一个错误：\n${error.message}`);
  }
}

/**
 * 【UI渲染】根据AI返回的数据渲染热搜列表
 */
function renderHotSearchList(hotSearchData) {
  const listEl = document.getElementById('weibo-hot-search-list');
  listEl.innerHTML = '';

  if (!hotSearchData || !Array.isArray(hotSearchData)) {
    listEl.innerHTML = '<p style="text-align:center; color: #8a8a8a;">AI返回的数据格式不正确，无法渲染。</p>';
    return;
  }

  hotSearchData.forEach((item, index) => {
    const rank = index + 1;
    const tagClass = { 热: 'hot', 新: 'new', 荐: 'rec' }[item.tag] || 'rec';

    const itemEl = document.createElement('div');
    itemEl.className = 'hot-search-item';
    itemEl.dataset.rank = rank;
    itemEl.innerHTML = `
            <span class="hot-search-rank">${rank}</span>
            <div class="hot-search-content">
                <span class="hot-search-topic">${item.topic}</span>
                <span class="hot-search-tag ${tagClass}">${item.tag}</span>
            </div>
            <span class="hot-search-heat" style="color: var(--text-secondary); font-size: 13px;">${item.heat}</span>
        `;
    itemEl.addEventListener('click', () => showHotTopicFeedScreen(item.topic));
    listEl.appendChild(itemEl);
  });
}

/**
 * 【总入口】显示并生成指定热搜话题的微博Feed (已增加缓存功能)
 */
async function showHotTopicFeedScreen(topic) {
  currentHotTopic = topic;
  document.getElementById('weibo-hottopic-title').textContent = topic;
  switchToWeiboView('weibo-hottopic-feed-view');

  // 【核心修改】检查“小本本”里有没有记录
  if (hotTopicFeedCache[topic]) {
    // 如果有，就直接显示，不重新生成
    console.log(`从缓存加载话题: ${topic}`);
    const feedEl = document.getElementById('weibo-hottopic-feed-list');
    renderWeiboFeed(feedEl, hotTopicFeedCache[topic], true);
  } else {
    // 如果没有，才调用函数去生成新的内容
    await generateHotSearchFeed(topic);
  }
}

/**
 * 【AI核心 V2 - 已修复拼写错误 & 增加缓存】调用API为指定话题生成微博Feed
 */
async function generateHotSearchFeed(topic) {
  const feedEl = document.getElementById('weibo-hottopic-feed-list');
  feedEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">正在生成内容，请稍候...</p>';

  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) {
    alert('请先配置API！');
    return;
  }

  const allChars = Object.values(state.chats)
    .filter(c => !c.isGroup)
    .map(c => ({ name: c.name, persona: c.settings.aiPersona.substring(0, 100) }));
  // 【修复重复NPC问题】从全局NPC库获取所有NPC，并基于ID去重
  const npcMap = new Map();
  const allSingleChats = Object.values(state.chats).filter(c => !c.isGroup);
  for (const chat of allSingleChats) {
    let enabledNpcs = [];
    if (typeof getEnabledNpcs === 'function') {
      enabledNpcs = await getEnabledNpcs(chat);
    } else if (chat.enabledNpcIds && chat.enabledNpcIds.length > 0) {
      const allNpcsFromDb = await db.globalNpcs.toArray();
      enabledNpcs = allNpcsFromDb.filter(npc => chat.enabledNpcIds.includes(npc.id));
    }
    enabledNpcs.forEach(npc => {
      if (!npcMap.has(npc.id)) {
        npcMap.set(npc.id, npc);
      }
    });
  }
  const allNpcs = Array.from(npcMap.values()).map(npc => ({ name: npc.name, persona: npc.persona.substring(0, 100) }));
  const allPeople = [...allChars, ...allNpcs];

  const systemPrompt = `
# 任务
你是一个“微博内容生成器”。你的任务是围绕一个给定的热搜话题，生成一批相关的微博帖子。

# 当前热搜话题
**${topic}**

# 【【【核心原则：严格遵循人设】】】
1.  **人设至上**: 你必须【严格遵循】"可用人物列表"中每个角色的人设信息。如果人设中明确写了两个角色是情侣、恋人、夫妻等关系，那就必须按照这个关系来生成内容。如果人设中写的是好朋友，那就只能是好朋友。
2.  **禁止杜撰关系**: 绝对禁止【私自创作】人设中没有明确说明的角色关系。你只能根据提供的人设信息进行合理发挥，不能自行添加或修改角色之间的关系。
3.  **人设一致性**: 所有生成的微博内容必须符合角色的身份、职业、性格等人设特征，不能出现与人设矛盾的内容。

# 【【【真实微博环境模拟】】】
热搜话题下的微博内容应该反映真实的热点事件传播过程：

**内容类型分布：**
- **官方/当事人发布**: 如果是角色相关话题，应该包含角色本人或官方账号发布的微博（热度最高，点赞50万+）
- **粉丝反应**: 粉丝的庆祝、祝福、讨论等（热度较高，点赞10-30万）
- **路人吃瓜**: 普通网友的讨论、猜测、评论等（热度中等，点赞1-10万）
- **媒体/大V转发**: 官方媒体、大V账号的转发和评论（热度高，点赞20-50万）
- **争议/质疑**: 部分网友的质疑、批评等（热度中等，点赞5-15万）

**评论风格多样性：**
- 粉丝的激动、祝福、支持
- 路人的吃瓜、好奇、讨论
- 黑粉的质疑、批评、嘲讽
- 媒体的客观报道、分析
- 路人的中立评论、理性讨论

# 核心规则
1.  **数量**: 生成 5 到 10 条微博。
2.  **相关性**: 所有微博内容【必须】与话题 **"${topic}"** 强相关，并且【必须】在内容中包含 **${topic}** 这个话题标签。
3.  **高热度**: 生成的微博必须看起来像是热搜里的内容，所以它们的 "likes" (点赞数) 和 "comments" (评论数) 【必须】非常高。点赞数应在 10000 到 500000 之间，评论数应在 800 到 20000 之间。主要当事人的微博热度应该最高。
4.  **评论生成**: 为每条微博生成 8 到 10 条真实感的路人评论。评论内容应与微博内容相关，风格多样（支持、质疑、吃瓜、祝福等）。
5.  **作者多样性**: 微博的作者可以是下方“可用人物列表”中的角色，也可以是你虚构的路人、大V或官方媒体。如果让列表中的角色发言，内容必须符合他的人设。
6.  **格式铁律**: 你的回复【必须且只能】是一个严格的JSON数组，数组中包含多条微博对象。每个对象【必须】包含以下字段:
    -   \`"author"\`: (字符串) 作者昵称。
    -   \`"content"\`: (字符串) 微博正文，必须包含话题标签 ${topic}。
    -   \`"likes"\`: (数字) 10000到500000之间的随机高赞数。
    -   \`"comments"\`: (数字) 800到20000之间的随机高评论数。
    -   \`"comments_list"\`: (数组) 包含8-10个评论对象的数组，每个对象格式为 \`{"author": "评论者昵称", "text": "评论内容"}\`。

# 可用人物列表 (你可以让他们发言)
${JSON.stringify(allPeople, null, 2)}
`;
  try {
    let isGemini = proxyUrl === GEMINI_API_URL;
    let messagesForApi = [{ role: 'user', content: systemPrompt }];
    let geminiConfig = toGeminiRequestData(
      model,
      apiKey,
      systemPrompt,
      messagesForApi,
      isGemini,
      state.apiConfig.temperature,
    );

    const response = await fetch(
      isGemini ? geminiConfig.url : `${proxyUrl}/v1/chat/completions`,
      isGemini
        ? geminiConfig.data
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              messages: messagesForApi,
              temperature: parseFloat(state.apiConfig.temperature) || 0.8,
              response_format: { type: 'json_object' },
            }),
          },
    );
    if (!response.ok) throw new Error(`API请求失败: ${response.status} - ${await response.text()}`);

    const data = await response.json();
    const aiResponseContent = isGemini
      ? data.candidates?.[0]?.content?.parts?.[0]?.text
      : data.choices?.[0]?.message?.content;
    if (!aiResponseContent) {
      throw new Error('API返回了空内容，可能被安全策略拦截。');
    }

    const sanitizedContent = aiResponseContent.replace(/^```json\s*|```$/g, '').trim();
    const responseData = JSON.parse(sanitizedContent);
    const feedData = responseData.posts || responseData;

    // 【核心修改】将新生成的内容，记在“小本本”上
    hotTopicFeedCache[topic] = feedData;

    renderWeiboFeed(feedEl, feedData, true);
  } catch (error) {
    console.error('生成热搜Feed失败:', error);
    feedEl.innerHTML = `<p style="text-align:center; color: #ff3b30; padding: 20px;">生成失败: ${error.message}</p>`;
  }
}

/**
 * 【总入口 V3 - 已支持多角色选择】生成微博广场Feed
 * @param {Array} hotTopics - (可选) 从热搜生成函数传过来的话题数组
 * @param {Array|string} targets - (新增) 目标角色ID数组或字符串'all'
 */
async function generatePlazaFeed(hotTopics = null, targets = 'all') {
  if (!hotTopics) {
    await showCustomAlert('请稍候...', '正在生成广场动态...');
  }
  const feedEl = document.getElementById('weibo-plaza-feed-list');
  feedEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">正在加载内容，请稍候...</p>';

  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) {
    alert('请先配置API！');
    return;
  }

  let publicFiguresContext = '';
  let taskInstruction = '你的任务是模拟一个真实的社交媒体广场，生成10条由不同路人发布的微博帖子。';

  let publicFigures = [];
  if (targets === 'all') {
    publicFigures = Object.values(state.chats)
      .filter(chat => !chat.isGroup)
      .map(chat => ({
        name: chat.name,
        persona: chat.settings.aiPersona.substring(0, 150) + '...',
        weibo_profession: chat.settings.weiboProfession || '未设定',
        weibo_instruction: chat.settings.weiboInstruction || '无',
      }));
  } else if (Array.isArray(targets)) {
    targets.forEach(chatId => {
      const char = state.chats[chatId];
      if (char) {
        publicFigures.push({
          name: char.name,
          persona: char.settings.aiPersona.substring(0, 150) + '...',
          weibo_profession: char.settings.weiboProfession || '未设定',
          weibo_instruction: char.settings.weiboInstruction || '无',
        });
      }
    });
    if (publicFigures.length === 1) {
      taskInstruction = `你的任务是模拟一个真实的社交媒体广场，生成10条与角色“${publicFigures[0].name}”相关的、由不同路人发布的微博帖子。`;
    } else {
      taskInstruction = `你的任务是模拟一个真实的社交媒体广场，生成10条与角色 ${publicFigures
        .map(p => `“${p.name}”`)
        .join('、')} 相关的、由不同路人发布的微博帖子。`;
    }
  }

  publicFiguresContext =
    publicFigures.length > 0
      ? `# 核心参考人物 (你生成的内容【必须】围绕他们展开)\n${JSON.stringify(publicFigures, null, 2)}`
      : '';

  const topicsContext =
    hotTopics && Array.isArray(hotTopics) && hotTopics.length > 0
      ? `请围绕以下热门话题生成内容：${hotTopics.map(t => t.topic).join('、 ')}`
      : '请随机生成一些生活化的日常内容。';

  // 后续的 systemPrompt 和 API 调用逻辑与你现有代码完全相同，无需修改...
  const systemPrompt = `
# 任务
你是一个“微博广场内容生成器”。${taskInstruction}
# 【【【核心原则：严格遵循人设】】】
1.  **人设至上**: 你必须【严格遵循】"核心参考人物"列表中每个角色的人设信息。如果人设中明确写了两个角色是情侣、恋人、夫妻等关系，那就必须按照这个关系来生成内容。如果人设中写的是好朋友，那就只能是好朋友。
2.  **禁止杜撰关系**: 绝对禁止【私自创作】人设中没有明确说明的角色关系。你只能根据提供的人设信息进行合理发挥，不能自行添加或修改角色之间的关系。
3.  **人设一致性**: 所有生成的内容如果提到了"核心参考人物"列表中的角色，必须符合他们的身份、职业、性格等人设特征，不能出现与人设矛盾的内容。

# 【【【真实微博广场环境】】】
微博广场应该模拟真实的社交媒体环境，包含：
- **日常分享**: 普通人的生活日常、心情、照片等
- **热点讨论**: 围绕热门话题的讨论、转发、评论
- **随机内容**: 各种生活化的内容，让环境更真实

# 核心规则
1.  **身份**: 发帖者都是普通人，昵称要生活化。
2.  **内容**: 帖子内容应是生活化的日常。${topicsContext}
3.  **热度**: 赞和评论数可高可低，模拟真实世界的随机性（点赞数：0-50000，评论数：0-5000）。
4.  **格式铁律**: 你的回复【必须且只能】是一个严格的JSON数组，包含10个微博对象。每个对象的格式与“热搜Feed”的格式完全相同（包含 author, content, likes, comments, comments_list 字段）。
    - \`"comments_list"\`: (数组) 包含2-5条评论对象的数组，每个对象格式为 \`{"author": "评论者昵称", "text": "评论内容"}\`。
${publicFiguresContext}
`;
  try {
    let isGemini = proxyUrl === GEMINI_API_URL;
    let messagesForApi = [{ role: 'user', content: systemPrompt }];
    let geminiConfig = toGeminiRequestData(
      model,
      apiKey,
      systemPrompt,
      messagesForApi,
      isGemini,
      state.apiConfig.temperature,
    );
    const response = await fetch(
      isGemini ? geminiConfig.url : `${proxyUrl}/v1/chat/completions`,
      isGemini
        ? geminiConfig.data
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              messages: messagesForApi,
              temperature: parseFloat(state.apiConfig.temperature) || 0.8,
              response_format: { type: 'json_object' },
            }),
          },
    );
    if (!response.ok) throw new Error(`API请求失败: ${response.status} - ${await response.text()}`);
    const data = await response.json();
    const aiResponseContent = isGemini
      ? data.candidates?.[0]?.content?.parts?.[0]?.text
      : data.choices?.[0]?.message?.content;
    if (!aiResponseContent) {
      throw new Error('API返回了空内容，可能被安全策略拦截。');
    }
    const sanitizedContent = aiResponseContent.replace(/^```json\s*|```$/g, '').trim();
    const responseData = JSON.parse(sanitizedContent);
    const feedData = responseData.posts || responseData;
    renderWeiboFeed(feedEl, feedData, false);
    if (!hotTopics) {
      await showCustomAlert('操作成功', '广场生成完毕！');
    }
  } catch (error) {
    console.error('生成广场Feed失败:', error);
    feedEl.innerHTML = `<p style="text-align:center; color: #ff3b30; padding: 20px;">生成失败: ${error.message}</p>`;
  }
}

/**
 * 【UI渲染 V3 - 修复评论和头像，并添加删除按钮】通用函数，用于渲染微博Feed列表
 */
function renderWeiboFeed(containerEl, feedData, isHotSearch) {
  containerEl.innerHTML = '';

  if (!feedData || !Array.isArray(feedData)) {
    containerEl.innerHTML =
      '<p style="text-align:center; color: var(--text-secondary);">AI返回的数据格式不正确，无法渲染。</p>';
    return;
  }

  feedData.forEach((post, index) => {
    const postEl = document.createElement('div');
    postEl.className = 'weibo-post-item';
    postEl.dataset.postId = `temp_${index}`;

    let finalAvatar = 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
    const potentialChar = Object.values(state.chats).find(c => c.name === post.author);
    if (potentialChar) {
      finalAvatar = potentialChar.settings.aiAvatar;
    }

    let commentsHtml = '';
    if (post.comments_list && post.comments_list.length > 0) {
      commentsHtml += '<div class="weibo-comments-container">';
      post.comments_list.forEach(comment => {
        const commenterName = comment.author || '匿名用户';
        const commentText = comment.text || '';
        commentsHtml += `
                    <div class="weibo-comment-item">
                        <span class="weibo-commenter-name">${commenterName}:</span>
                        <span class="weibo-comment-text">${commentText}</span>
                    </div>`;
      });
      commentsHtml += '</div>';
    }

    postEl.innerHTML = `
            <div class="weibo-post-header">
                <img src="${finalAvatar}" class="weibo-post-avatar">
                <div class="weibo-post-info">
                    <span class="weibo-post-nickname">${post.author}</span>
                    <span class="weibo-post-timestamp">${isHotSearch ? '热搜内容' : '刚刚'}</span>
                </div>
                <button class="weibo-post-delete-btn" title="删除这条动态">×</button>
            </div>
            <div class="weibo-post-content">${(post.content || '').replace(/\n/g, '<br>')}</div>
            <div class="weibo-post-footer">
                <div class="weibo-post-actions">
                    <span class="weibo-action-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                        <span>${post.likes || 0}</span>
                    </span>
                    <span class="weibo-action-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                        <span>${post.comments || 0}</span>
                    </span>
                </div>
                ${commentsHtml}
            </div>
        `;
    containerEl.appendChild(postEl);
  });
}

/**
 * 【全新】删除一条微博评论
 * @param {number} postId - 评论所在的微博ID
 * @param {string} commentId - 要删除的评论的ID
 */
async function deleteWeiboComment(postId, commentId) {
  const post = await db.weiboPosts.get(postId);
  if (!post || !post.comments) return;

  const commentIndex = post.comments.findIndex(c => c.commentId === commentId);
  if (commentIndex === -1) return;

  const commentText = post.comments[commentIndex].commentText;

  const confirmed = await showCustomConfirm(
    '删除评论',
    `确定要删除这条评论吗？\n\n“${commentText.substring(0, 50)}...”`,
    { confirmButtonClass: 'btn-danger' },
  );

  if (confirmed) {
    post.comments.splice(commentIndex, 1);
    await db.weiboPosts.put(post);
    await renderMyWeiboFeed();
    await renderFollowingWeiboFeed();
    alert('评论已删除。');
  }
}

async function showFollowingList() {
  const modal = document.getElementById('weibo-following-modal');
  const listContainer = document.getElementById('weibo-following-list-container');
  listContainer.innerHTML = '';

  const allSingleChats = Object.values(state.chats).filter(chat => !chat.isGroup);

  if (allSingleChats.length === 0) {
    listContainer.innerHTML = '<p style="text-align:center; color:grey; padding: 20px;">还没有关注任何人哦</p>';
  } else {
    for (const chat of allSingleChats) {
      const charItem = document.createElement('div');
      charItem.className = 'weibo-following-item';
      charItem.innerHTML = `
                <img src="${chat.settings.aiAvatar || defaultAvatar}" class="weibo-following-avatar">
                <span class="weibo-following-name">${chat.name}</span>
                <button class="view-profile-btn" data-char-id="${chat.id}">主页</button>
                <span class="weibo-action-trigger-btn" data-target-id="${chat.id}" data-target-name="${
        chat.name
      }" data-is-npc="false" title="为Ta执行操作">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>
                </span>
            `;
      listContainer.appendChild(charItem);

      // 【NPC库优化】从全局NPC库获取启用的NPC
      let enabledNpcs = [];
      if (typeof getEnabledNpcs === 'function') {
        enabledNpcs = await getEnabledNpcs(chat);
      } else if (chat.enabledNpcIds && chat.enabledNpcIds.length > 0) {
        const allNpcs = await db.globalNpcs.toArray();
        enabledNpcs = allNpcs.filter(npc => chat.enabledNpcIds.includes(npc.id));
      }
      if (enabledNpcs.length > 0) {
        enabledNpcs.forEach(npc => {
          const npcItem = document.createElement('div');
          npcItem.className = 'weibo-following-item';
          npcItem.style.paddingLeft = '30px';
          npcItem.innerHTML = `
                         <img src="${npc.avatar || defaultGroupMemberAvatar}" class="weibo-following-avatar">
                         <span class="weibo-following-name">${npc.name} (NPC)</span>
                         <span class="weibo-action-trigger-btn" data-target-id="${npc.id}" data-target-name="${
            npc.name
          }" data-is-npc="true" data-owner-id="${chat.id}" title="为Ta执行操作">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>
                         </span>
                    `;
          listContainer.appendChild(npcItem);
        });
      }
    }
  }

  modal.classList.add('visible');
}

/**
 * 【评论优化版 V3 - 禁止回复用户】AI生成微博评论的核心函数
 * @param {number} postId - 需要生成评论的微博ID
 */
async function generateWeiboComments(postId) {
  const post = await db.weiboPosts.get(postId);
  if (!post) {
    alert('错误：找不到这条微博！');
    return;
  }

  await showCustomAlert('请稍候...', '正在召唤高质量网友...');

  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) {
    alert('请先配置API！');
    return;
  }

  const userNickname = state.qzoneSettings.weiboNickname || state.qzoneSettings.nickname || '我';

  let authorPersona = '一个普通用户。';
  let authorProfession = '未设定';
  const authorName = post.authorId === 'user' ? userNickname : post.authorNickname;

  if (post.authorId === 'user') {
    authorPersona = state.qzoneSettings.weiboUserPersona || '一个普通的微博用户。';
    authorProfession = state.qzoneSettings.weiboUserProfession || '未设定';
  } else {
    const authorChat = state.chats[post.authorId];
    if (authorChat) {
      authorPersona = authorChat.settings.aiPersona || '无';
      authorProfession = authorChat.settings.weiboProfession || '未设定';
    }
  }
  const truncatedPersona = authorPersona.substring(0, 400);
  const postContent = (post.content || '').substring(0, 200);
  const existingComments = (post.comments || [])
    .slice(-5)
    .map(c => `${c.authorNickname}: ${c.commentText}`)
    .join('\n');

  let imageContext = '';
  if (post.imageUrl && post.imageDescription) {
    imageContext = `
- **图片内容**: 这条微博配有一张图片，描述为：“${post.imageDescription}”`;
  } else if (post.postType === 'text_image' && post.hiddenContent) {
    imageContext = `
- **图片内容**: 这是一张文字图，上面的内容是：“${post.hiddenContent}”`;
  }

  // 【分组隔离】获取帖子作者的分组ID（如果存在）
  const authorGroupId = post.authorId === 'user' ? null : (state.chats[post.authorId]?.groupId || null);
  
  const commenterPersonas = new Map();
  commenterPersonas.set(authorName, `[职业: ${authorProfession}] [人设: ${truncatedPersona}]`);

  if (post.comments && post.comments.length > 0) {
    post.comments.forEach(comment => {
      const commenterName = comment.authorNickname;
      if (!commenterPersonas.has(commenterName)) {
        const commenterChat = Object.values(state.chats).find(
          c => !c.isGroup && (c.settings.weiboNickname === commenterName || c.name === commenterName)
        );
        if (commenterChat && !commenterChat.isGroup) {
          // 【分组隔离】只添加与帖子作者同分组的评论者
          const commenterGroupId = commenterChat.groupId || null;
          // 如果帖子作者没有分组，或者评论者与作者在同一分组，则添加
          if (!authorGroupId || commenterGroupId === authorGroupId) {
            const profession = commenterChat.settings.weiboProfession || '未设定';
            const persona = (commenterChat.settings.aiPersona || '无').substring(0, 200);
            commenterPersonas.set(commenterName, `[职业: ${profession}] [人设: ${persona}]`);
          }
        }
      }
    });
  }
  
  // 【分组隔离】获取所有与帖子作者同分组的角色，用于生成评论
  const availableCommenters = Object.values(state.chats)
    .filter(chat => {
      if (chat.isGroup) return false;
      if (post.authorId === 'user') return true; // 用户帖子，所有角色都可以评论
      const chatGroupId = chat.groupId || null;
      return !authorGroupId || chatGroupId === authorGroupId;
    })
    .map(chat => ({
      name: chat.settings.weiboNickname || chat.name,
      profession: chat.settings.weiboProfession || '未设定',
      persona: (chat.settings.aiPersona || '无').substring(0, 200)
    }));
  
  // 将可用评论者添加到上下文中
  let availableCommentersContext = '';
  if (availableCommenters.length > 0) {
    availableCommentersContext = '\n# 可参与评论的角色（与作者在同一分组）\n';
    availableCommenters.forEach(char => {
      availableCommentersContext += `- **${char.name}**: [职业: ${char.profession}] [人设: ${char.persona}]\n`;
    });
    availableCommentersContext += '\n**重要提示**: 生成的评论者昵称必须来自上述列表中的角色，确保评论者与帖子作者在同一分组。\n';
  }

  let commenterContext = '';
  if (commenterPersonas.size > 0) {
    commenterContext += '\n# 评论区已有角色人设 (供你回复时参考)\n';
    commenterPersonas.forEach((persona, name) => {
      commenterContext += `- **${name}**: ${persona}\n`;
    });
  }

  const systemPrompt = `
# 任务
你是一个专业的“社交媒体模拟器”。你的任务是根据一个特定角色的“人设”，为他/她发布的一条微博生成一批真实的、符合情景的网友评论。

# 微博情景
- **作者**: ${authorName}
- **微博文字**: ${postContent || '(该微博没有配文)'}
${imageContext}
- **已有评论 (你可以回复他们)**:
${existingComments || '(暂无评论)'}

${commenterContext}

${availableCommentersContext}

# 【【【评论生成核心规则】】】
1.  **【【【回复禁令】】】**: 绝对禁止回复昵称为“**${userNickname}**”的任何评论。这是最高优先级的规则，因为用户会自己回复。你可以回复其他任何人的评论。
2.  **【【【严禁使用】】】**: 绝对禁止使用 “路人甲”、“网友A”、“粉丝B” 这类代号作为评论者昵称。
3.  **昵称多样化**: 评论者的昵称必须非常真实、多样化且符合微博生态。例如：“今天也要早睡”、“可乐加冰块”、“是小王不是小张”、“理性吃瓜第一线”。
4.  **内容与人设强相关**: 评论内容必须与【微博内容(包括文字和图片)】和【作者以及被回复者的人设】高度相关。思考：什么样的粉丝会关注这样的人？他们会怎么说话？当回复一个有特定人设的角色时，你的回复必须考虑到对方的身份。
5.  **风格多样化**: 生成的评论应包含不同立场和风格，例如：
    -   **粉丝**: “哥哥太帅了！新剧什么时候播？”
    -   **路人**: “这个地方看起来不错，求地址！”
    -   **黑粉/质疑者**: “就这？感觉p图有点过了吧...”
    -   **玩梗**: “楼上是不是XX派来的间谍（狗头）”
6.  **格式铁律**: 你的回复【必须且只能】是一个严格的JSON数组，每个对象代表一条评论。
    -   发表新评论, 使用格式: \`{"author": "不吃香菜的仙女", "comment": "哇，这个好好看！"}\`
    -   回复已有评论, 使用格式: \`{"author": "爱吃瓜的猹", "comment": "我也觉得！", "replyTo": "不吃香菜的仙女"}\`

现在，请开始你的表演。
`;

  try {
    let isGemini = proxyUrl === GEMINI_API_URL;
    let messagesForApi = [{ role: 'user', content: systemPrompt }];
    let geminiConfig = toGeminiRequestData(
      model,
      apiKey,
      systemPrompt,
      messagesForApi,
      isGemini,
      state.apiConfig.temperature,
    );

    const response = isGemini
      ? await fetch(geminiConfig.url, geminiConfig.data)
      : await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: model,
            messages: messagesForApi,
            temperature: parseFloat(state.apiConfig.temperature) || 0.8,
            response_format: { type: 'json_object' },
          }),
        });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const aiResponseContent = (isGemini ? data.candidates[0].content.parts[0].text : data.choices[0].message.content)
      .replace(/^```json\s*|```$/g, '')
      .trim();

    const newComments = JSON.parse(aiResponseContent);

    if (Array.isArray(newComments) && newComments.length > 0) {
      const postToUpdate = await db.weiboPosts.get(post.id);
      if (!postToUpdate) throw new Error('在数据库中找不到要更新的帖子！');

      if (!postToUpdate.comments) postToUpdate.comments = [];

      newComments.forEach(comment => {
        if (comment.author && comment.comment) {
          const newCommentObject = {
            commentId: 'comment_' + Date.now() + Math.random(),
            authorNickname: comment.author,
            commentText: comment.comment,
            timestamp: Date.now(),
          };
          if (comment.replyTo) {
            newCommentObject.replyToNickname = comment.replyTo;
          }
          postToUpdate.comments.push(newCommentObject);
        }
      });

      postToUpdate.baseLikesCount =
        (postToUpdate.baseLikesCount || 0) + Math.floor(Math.random() * newComments.length * 3 + 5);

      await db.weiboPosts.put(postToUpdate);

      await renderMyWeiboFeed();
      await renderFollowingWeiboFeed();

      alert(`成功生成了 ${newComments.length} 条新评论！`);
    } else {
      alert('AI没有生成有效的评论。');
    }
  } catch (error) {
    console.error('生成微博评论失败:', error);
    await showCustomAlert('生成失败', `发生了一个错误：\n${error.message}`);
  }
}

/**
 * 【全新】打开指定角色的微博主页
 * @param {string} charId - 要查看的角色的ID
 */
async function openWeiboCharProfile(charId) {
  currentViewingWeiboProfileId = charId;
  const chat = state.chats[charId];
  if (!chat) return;

  // 渲染角色主页内容
  await renderWeiboCharProfile(charId);

  // 渲染该角色的微博Feed
  await renderCharSpecificFeed(charId);

  // 切换到角色主页屏幕
  showScreen('weibo-char-profile-screen');

  // 隐藏关注列表弹窗（如果它还开着）
  document.getElementById('weibo-following-modal').classList.remove('visible');
}

/**
 * 【全新】渲染角色微博主页的个人资料部分 (V2 - 支持粉丝/关注数)
 * @param {string} charId - 角色的ID
 */
async function renderWeiboCharProfile(charId) {
  const chat = state.chats[charId];
  if (!chat) return;

  // 渲染基础信息（这部分不变）
  document.getElementById('weibo-char-profile-title').textContent = `${chat.name}的主页`;
  document.getElementById('weibo-char-avatar-img').src = chat.settings.weiboAvatar || chat.settings.aiAvatar;
  document.getElementById('weibo-char-nickname').textContent = chat.settings.weiboNickname || chat.name;
  document.getElementById('weibo-char-background-img').src = chat.settings.weiboBackground;
  document.getElementById('weibo-char-profession-display').textContent = chat.settings.weiboProfession || '职业未设定';

  document.getElementById('weibo-char-following-count').textContent = chat.settings.weiboFollowingCount || '0';
  document.getElementById('weibo-char-fans-count').textContent = chat.settings.weiboFansCount || '0';

  const postCount = await db.weiboPosts.where('authorId').equals(charId).count();
  document.getElementById('weibo-char-posts-count').textContent = postCount;

  const frameImg = document.getElementById('weibo-char-avatar-frame');
  const frameUrl = chat.settings.weiboAvatarFrame || '';
  if (frameUrl) {
    frameImg.src = frameUrl;
    frameImg.style.display = 'block';
  } else {
    frameImg.style.display = 'none';
  }
}

/**
 * 【全新】渲染指定角色的微博Feed（支持分组隔离）
 * @param {string} charId - 被查看角色的ID
 * 注意：这是从用户视角查看某个角色的主页，用户可以看到该角色的所有帖子
 */
async function renderCharSpecificFeed(charId) {
  const feedEl = document.getElementById('char-weibo-feed-list');
  feedEl.innerHTML = '';

  const posts = await db.weiboPosts.where('authorId').equals(charId).reverse().sortBy('timestamp');

  if (posts.length === 0) {
    feedEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Ta 还没有发过微博哦。</p>';
    return;
  }

  posts.forEach(post => {
    // 从用户视角查看，传递 'user' 作为 viewerCharId（用户可以看到所有帖子和评论）
    const postElement = createWeiboPostElement(post, 'user');
    if (postElement) {
      feedEl.appendChild(postElement);
    }
  });
}

/**
 * 【全新】打开角色微博资料的编辑器
 */
async function openCharWeiboEditor() {
  if (!currentViewingWeiboProfileId) return;
  const chat = state.chats[currentViewingWeiboProfileId];
  if (!chat) return;

  // 填充当前数据到编辑器
  document.getElementById('char-weibo-editor-avatar-preview').src = chat.settings.weiboAvatar || chat.settings.aiAvatar;
  document.getElementById('char-weibo-editor-nickname-input').value = chat.settings.weiboNickname || chat.name;
  document.getElementById('char-weibo-editor-bg-preview').src = chat.settings.weiboBackground;

  // 显示弹窗
  document.getElementById('char-weibo-editor-modal').classList.add('visible');
}

/**
 * 【全新】保存对角色微博资料的修改
 */
async function saveCharWeiboProfile() {
  if (!currentViewingWeiboProfileId) return;
  const chat = state.chats[currentViewingWeiboProfileId];
  if (!chat) return;

  // 从编辑器获取新数据
  chat.settings.weiboAvatar = document.getElementById('char-weibo-editor-avatar-preview').src;
  chat.settings.weiboNickname = document.getElementById('char-weibo-editor-nickname-input').value.trim();
  chat.settings.weiboBackground = document.getElementById('char-weibo-editor-bg-preview').src;

  // 保存到数据库
  await db.chats.put(chat);

  // 刷新主页显示
  await renderWeiboCharProfile(currentViewingWeiboProfileId);

  document.getElementById('char-weibo-editor-modal').classList.remove('visible');
  alert('角色微博资料已保存！');
}

/**
 * 【全新】根据角色人设和职业，生成初始的微博关注数和粉丝数
 * @param {object} chat - 角色的聊天对象
 * @returns {{following: string, fans: string}}
 */
function getInitialWeiboStats(chat) {
  const persona = (chat.settings.aiPersona || '') + (chat.settings.weiboProfession || '');
  const keywords = ['偶像', '明星', '演员', '歌手', '博主', '网红', 'UP主', '主播', '选手', '画家', '作家'];
  const isPublicFigure = keywords.some(keyword => persona.includes(keyword));

  let fansCount, followingCount;

  if (isPublicFigure) {
    fansCount = Math.floor(100000 + Math.random() * 9900000); // 10万 - 1000万
    followingCount = Math.floor(50 + Math.random() * 450); // 50 - 500
  } else {
    fansCount = Math.floor(100 + Math.random() * 4900); // 100 - 5000
    followingCount = Math.floor(50 + Math.random() * 250); // 50 - 300
  }

  return {
    fans: formatNumberToChinese(fansCount),
    following: formatNumberToChinese(followingCount),
  };
}

/**
 * 【全新】将数字格式化为带“万”或“亿”的字符串
 * @param {number} num - 原始数字
 * @returns {string} - 格式化后的字符串
 */
function formatNumberToChinese(num) {
  if (num >= 100000000) {
    return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  }
  if (num >= 10000) {
    return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  }
  return String(num);
}

/**
 * 【全新】显示微博内容生成的目标角色选择器
 * @returns {Promise<object|string|null>} - 返回选中的角色对象, 'all', 或 null (如果用户取消)
 */
async function showCharacterSelectorForWeibo() {
  const singleChats = Object.values(state.chats).filter(chat => !chat.isGroup);

  if (singleChats.length === 0) {
    alert('还没有任何角色可以生成内容哦。');
    return null;
  }

  const options = [
    { text: '✨ 随机 (所有角色)', value: 'all' },
    ...singleChats.map(chat => ({
      text: `👤 ${chat.name}`,
      value: chat.id,
    })),
  ];

  const selectedId = await showChoiceModal('请选择本次生成的主角', options);

  if (selectedId === null) {
    return null;
  }
  if (selectedId === 'all') {
    return 'all';
  }

  return state.chats[selectedId];
}
/**
 * 【全新 | V2多选版】显示微博内容生成的目标角色选择器
 * @returns {Promise<Array|string|null>} - 返回选中的角色ID数组, 'all', 或 null
 */
async function showMultiCharacterSelectorForWeibo() {
  return new Promise(resolve => {
    const modal = document.getElementById('weibo-char-selector-modal');
    const listEl = document.getElementById('weibo-char-selector-list');
    const confirmBtn = document.getElementById('weibo-confirm-char-select-btn');
    const cancelBtn = document.getElementById('weibo-cancel-char-select-btn');
    const selectAllBtn = document.getElementById('weibo-select-all-btn');
    const deselectAllBtn = document.getElementById('weibo-deselect-all-btn');

    listEl.innerHTML = '';
    const singleChats = Object.values(state.chats).filter(chat => !chat.isGroup);

    if (singleChats.length === 0) {
      alert('还没有任何角色可以生成内容哦。');
      resolve(null);
      return;
    }

    const randomOption = document.createElement('div');
    randomOption.className = 'player-selection-item';
    randomOption.innerHTML = `
            <input type="radio" name="weibo-char-choice" value="all" id="weibo-char-random" checked style="margin-right: 15px;">
            <label for="weibo-char-random" style="display:flex; align-items:center; width:100%; cursor:pointer;">
                <span class="name">✨ 随机选择 (所有角色)</span>
            </label>
        `;
    listEl.appendChild(randomOption);

    const specificOptionHeader = document.createElement('div');
    specificOptionHeader.className = 'player-selection-item';
    specificOptionHeader.innerHTML = `
            <input type="radio" name="weibo-char-choice" value="specific" id="weibo-char-specific" style="margin-right: 15px;">
            <label for="weibo-char-specific" style="display:flex; align-items:center; width:100%; cursor:pointer;">
                <span class="name">👤 指定以下角色</span>
            </label>
        `;
    listEl.appendChild(specificOptionHeader);

    singleChats.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'player-selection-item';
      item.style.paddingLeft = '50px';
      item.innerHTML = `
                <input type="checkbox" class="weibo-char-checkbox" value="${chat.id}" id="weibo-char-${chat.id}">
                <label for="weibo-char-${
                  chat.id
                }" style="display:flex; align-items:center; width:100%; cursor:pointer;">
                    <img src="${chat.settings.aiAvatar || defaultAvatar}" alt="${chat.name}">
                    <span class="name">${chat.name}</span>
                </label>
            `;
      listEl.appendChild(item);
    });

    const cleanup = () => {
      modal.classList.remove('visible');
      newConfirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      selectAllBtn.removeEventListener('click', onSelectAll);
      deselectAllBtn.removeEventListener('click', onDeselectAll);
    };

    const onConfirm = () => {
      const choice = document.querySelector('input[name="weibo-char-choice"]:checked').value;
      if (choice === 'all') {
        cleanup();
        resolve('all');
      } else {
        const selectedIds = Array.from(document.querySelectorAll('.weibo-char-checkbox:checked')).map(cb => cb.value);
        if (selectedIds.length === 0) {
          alert('请至少选择一个指定的角色！');
          return;
        }
        cleanup();
        resolve(selectedIds);
      }
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    const onSelectAll = () => document.querySelectorAll('.weibo-char-checkbox').forEach(cb => (cb.checked = true));
    const onDeselectAll = () => document.querySelectorAll('.weibo-char-checkbox').forEach(cb => (cb.checked = false));

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    selectAllBtn.addEventListener('click', onSelectAll);
    deselectAllBtn.addEventListener('click', onDeselectAll);

    modal.classList.add('visible');
  });
}

/**
 * 【V2 - AI自主版】打开微博操作模态框
 * @param {object} targetInfo - 包含被操作角色信息的对象
 */
function openWeiboActionModal(targetInfo) {
  currentWeiboActionTarget = targetInfo; // 保存目标信息
  const modal = document.getElementById('weibo-action-modal');

  document.getElementById('weibo-action-modal-title').textContent = `为 "${targetInfo.name}" 触发行动`;

  const actorSelectGroup = document.getElementById('weibo-action-actor-select').parentElement;
  if (actorSelectGroup) {
    actorSelectGroup.style.display = 'none';
  }

  document.getElementById('weibo-action-prompt-input').value = '';
  document.querySelector('input[name="weibo_action_type"][value="post"]').checked = true;

  modal.classList.add('visible');
}

/**
 * 【AI核心 V2.2 - 评论用户微博版 + 500错误最终修复】执行AI操作（发微博/评论）
 */
async function handleWeiboAiAction() {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) {
    alert('请先配置API！');
    return;
  }

  document.getElementById('weibo-action-modal').classList.remove('visible');
  document.getElementById('weibo-following-modal').classList.remove('visible');
  await showCustomAlert('请稍候...', '正在请求AI生成内容，请耐心等待...');

  const actionType = document.querySelector('input[name="weibo_action_type"]:checked').value;
  const userInputPrompt = document.getElementById('weibo-action-prompt-input').value.trim();

  let target = {
    id: currentWeiboActionTarget.id,
    name: currentWeiboActionTarget.name,
    persona: '一个普通的微博用户。',
    profession: '',
    instruction: '',
  };

  if (currentWeiboActionTarget.isNpc) {
    const owner = state.chats[currentWeiboActionTarget.ownerId];
    const npc = owner.npcLibrary.find(n => n.id === currentWeiboActionTarget.id);
    if (npc) {
      target.persona = npc.persona;
      target.profession = owner.settings.weiboProfession || '';
      target.instruction = owner.settings.weiboInstruction || '';
    }
  } else {
    const char = state.chats[currentWeiboActionTarget.id];
    if (char) {
      target.persona = char.settings.aiPersona;
      target.profession = char.settings.weiboProfession || '';
      target.instruction = char.settings.weiboInstruction || '';
    }
  }

  let systemPrompt = '';
  let messagesForApi = [];

  try {
    if (actionType === 'post') {
      systemPrompt = `
# 任务: 角色扮演与微博创作
你现在【就是】角色“${target.name}”。
你的任务是根据你的身份信息，创作一条全新的微博。
# 你的身份信息
- **你的名字**: ${target.name}
- **你的职业**: ${target.profession || '未设定'}
- **你的人设**: ${target.persona}
- **你的微博指令 (必须遵守)**: ${target.instruction || '无'}
- **用户给你的提示 (可选参考)**: ${userInputPrompt || '无'}
# 【【【评论生成核心规则】】】
1.  **【【【严禁使用】】】**: 绝对禁止使用 “路人甲”、“网友A”、“粉丝B” 这类代号作为评论者昵称。
2.  **昵称多样化**: 评论者的昵称必须非常真实、多样化且符合微博生态。例如：“今天也要早睡”、“可乐加冰块”、“是小王不是小张”、“理性吃瓜第一线”。
3.  **内容与人设强相关**: 评论内容必须与【你即将创作的微博内容】和【你自己的人设】高度相关。
4.  **格式铁律**: 你的回复【必须且只能】是一个严格的JSON对象，格式如下:
   \`{"content": "微博正文内容...", "baseLikesCount": 随机生成的点赞数, "baseCommentsCount": 随机生成的评论数, "comments": "今天也要早睡: 评论1...\\n可乐加冰块: 评论2..."}\`
   - 点赞和评论数要符合你的身份地位。
   - "comments"字段是一个【字符串】，里面包含5-10条真实感的路人评论，每条评论用换行符'\\n'分隔。
`;
      messagesForApi.push({ role: 'user', content: systemPrompt });
    } else {
      let targetPost;
      let taskDescription;
      let extraContext = '';

      if (actionType === 'comment_plaza') {
        targetPost = await db.weiboPosts.orderBy('timestamp').last();
        if (!targetPost) throw new Error('广场上还没有任何微博可以评论！');
        taskDescription = `你的任务是根据你的身份信息，去评论下面这条最新的【广场微博】。`;
      } else if (actionType === 'comment_user') {
        targetPost = await db.weiboPosts.where('authorId').equals('user').reverse().first();
        if (!targetPost) throw new Error('用户还没有发布任何微博，无法评论！');
        taskDescription = `你的任务是根据你的身份信息，去评论下面这条由【用户】发布的最新微博。`;
      }

      let postAuthorName = targetPost.authorNickname;
      if (postAuthorName === '{{user}}') {
        postAuthorName = '我';
      }

      systemPrompt = `
# 任务: 角色扮演与微博评论
你现在【就是】角色“${target.name}”。
${taskDescription}
# 你的身份信息
- **你的名字**: ${target.name}
- **你的职业**: ${target.profession || '未设定'}
- **你的人设**: ${target.persona}
- **你的微博指令 (必须遵守)**: ${target.instruction || '无'}
- **用户给你的提示 (可选参考)**: ${userInputPrompt || '无'}
# 被评论的微博
- 作者: ${postAuthorName}
- 内容: ${targetPost.content}
${extraContext}
# 核心规则
1. **深度扮演**: 你的评论【必须】完全符合你的职业、人设和微博指令。
2. **格式铁律**: 你的回复【必须且只能】是一个严格的JSON对象，格式如下:
   \`{"commentText": "你的评论内容..."}\`
`;
      messagesForApi.push({ role: 'user', content: systemPrompt });
    }

    let isGemini = proxyUrl === GEMINI_API_URL;
    let geminiConfig = toGeminiRequestData(
      model,
      apiKey,
      systemPrompt,
      messagesForApi,
      isGemini,
      state.apiConfig.temperature,
    );

    const response = await fetch(
      isGemini ? geminiConfig.url : `${proxyUrl}/v1/chat/completions`,
      isGemini
        ? geminiConfig.data
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: model,
              messages: messagesForApi,
              temperature: parseFloat(state.apiConfig.temperature) || 0.8,
            }),
          },
    );

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (e) {
        errorBody = '无法读取错误响应体。';
      }
      throw new Error(`API请求失败: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`API返回错误: ${data.error.message || JSON.stringify(data.error)}`);
    }
    const aiResponseContent = (isGemini ? data.candidates[0].content.parts[0].text : data.choices[0].message.content)
      .replace(/^```json\s*|```$/g, '')
      .trim();

    const result = JSON.parse(aiResponseContent);

    if (actionType === 'post') {
      const newPost = {
        authorId: target.id,
        authorType: currentWeiboActionTarget.isNpc ? 'npc' : 'char',
        authorNickname: target.name,
        authorAvatar: currentWeiboActionTarget.isNpc
          ? state.chats[currentWeiboActionTarget.ownerId].npcLibrary.find(n => n.id === target.id).avatar ||
            defaultGroupMemberAvatar
          : state.chats[target.id].settings.aiAvatar || defaultAvatar,
        content: result.content,
        timestamp: Date.now(),
        likes: [],
        comments: [],
        baseLikesCount: result.baseLikesCount || 0,
        baseCommentsCount: result.baseCommentsCount || 0,
      };
      if (result.comments) {
        newPost.comments = result.comments
          .split('\n')
          .map(c => {
            const parts = c.split(/[:：]/);
            const commenter = parts.shift() || '路人';
            const commentText = parts.join(':').trim();
            return {
              commentId: 'comment_' + Date.now() + Math.random(),
              authorNickname: commenter,
              commentText: commentText,
            };
          })
          .filter(c => c.commentText);
      }
      await db.weiboPosts.add(newPost);
    } else {
      let postToUpdate;
      if (actionType === 'comment_plaza') {
        postToUpdate = await db.weiboPosts.orderBy('timestamp').last();
      } else {
        postToUpdate = await db.weiboPosts.where('authorId').equals('user').reverse().first();
      }

      if (postToUpdate) {
        if (!postToUpdate.comments) postToUpdate.comments = [];
        postToUpdate.comments.push({
          commentId: 'comment_' + Date.now(),
          authorId: target.id,
          authorNickname: target.name,
          commentText: result.commentText,
          timestamp: Date.now(),
        });
        await db.weiboPosts.put(postToUpdate);
      }
    }

    await renderMyWeiboFeed();
    await renderFollowingWeiboFeed();
    await showCustomAlert('操作成功', `“${target.name}”已成功执行操作！`);
  } catch (error) {
    console.error('微博AI操作失败:', error);
    await showCustomAlert('操作失败', `发生了一个错误：\n${error.message}`);
  }
}

/**
 * 【总入口】打开User的私信列表
 */
async function openUserDmListScreen() {
  const settings = state.qzoneSettings || {};
  // 如果还没有生成过私信，就先让AI生成
  if (!settings.userDms || settings.userDms.length === 0) {
    await generateUserDms();
  } else {
    // 如果已经有了，就直接渲染
    renderUserDmList(settings.userDms);
  }
  showScreen('user-dm-list-screen');
}

/**
 * 【AI核心 V4 - 已增加初始粉丝数量】调用AI为User生成一批粉丝私信
 */
async function generateUserDms(isAddingMore = false) {
  const settings = state.qzoneSettings;
  const { proxyUrl, apiKey, model } = state.apiConfig;

  if (!proxyUrl || !apiKey || !model) {
    alert('请先配置API！');
    return;
  }

  if (!isAddingMore && settings.userDms && settings.userDms.length > 0) {
    const confirmed = await showCustomConfirm('重新生成', '已有私信记录。重新生成将覆盖现有所有私信，确定吗？', {
      confirmButtonClass: 'btn-danger',
    });
    if (!confirmed) return;
  }

  const alertMessage = isAddingMore ? '正在召唤新粉丝...' : 'AI正在为你模拟粉丝私信...';
  await showCustomAlert('请稍候...', alertMessage);

  const userPersona = `
# 用户信息 (这是你私信的对象，请仔细阅读)
- 你的微博昵称: ${settings.weiboNickname || settings.nickname}
- 你的微博职业: ${settings.weiboUserProfession || '未设定'}
- 你的隐藏人设 (粉丝看不到，但会影响他们对你的态度): ${settings.weiboUserPersona || '一个普通的微博用户。'}
`;

  const existingDmsContext =
    isAddingMore && settings.userDms
      ? `# 已有私信 (供你参考，请生成全新的对话)\n${JSON.stringify(settings.userDms.slice(-5))}`
      : '';

  const systemPrompt = `
# 任务
你是一个专业的“微博生态模拟器”。你的任务是根据用户的微博人设，虚构一个包含${
    isAddingMore ? '3-4' : '5-8'
  }位不同粉丝/路人的私信列表，并为每位粉丝创作一段【他们单方面发送给用户的】私信内容。
${userPersona}
${existingDmsContext}

# 核心规则
1.  **粉丝多样性**: 创作${
    isAddingMore ? '3-4' : '5-8'
  }位不同类型的粉丝。他们的私信内容和语气【必须】与他们的身份以及【用户的微博人设】高度相关。
2.  **【【【对话单向性铁律】】】**: 你生成的对话【只能包含粉丝发送给用户的消息】。绝对不要模拟用户的回复。
3.  **格式铁律**: 你的回复【必须且只能】是一个严格的JSON数组，直接以 '[' 开头，以 ']' 结尾。
4.  **随机头像**: 为每位粉丝从下方头像池中随机挑选一个URL。

# JSON对象结构 (重要：messages数组里只能有sender为"fan"的对象！)
{
  "fanName": "粉丝的微博昵称",
  "fanPersona": "对这位粉丝的简单描述 (例如: '一个担心哥哥事业的妈妈粉')",
  "fanAvatarUrl": "从头像池中选择的URL",
  "messages": [
    { "sender": "fan", "text": "这是粉丝发来的第一条消息..." },
    { "sender": "fan", "text": "这是粉丝紧接着发的第二条消息，因为还没收到回复..." }
  ]
}

# 头像池 (fanAvatarUrl 必须从以下链接中选择一个)
- https://i.postimg.cc/PxZrFFFL/o-o-1.jpg
- https://i.postimg.cc/Qd0Y537F/com-xingin-xhs-20251011153800.png
现在，请开始生成【只有粉丝发言】的私信列表。`;
  try {
    const messagesForApi = [{ role: 'user', content: systemPrompt }];
    let isGemini = proxyUrl === GEMINI_API_URL;
    let geminiConfig = toGeminiRequestData(
      model,
      apiKey,
      systemPrompt,
      messagesForApi,
      isGemini,
      state.apiConfig.temperature,
    );

    const response = isGemini
      ? await fetch(geminiConfig.url, geminiConfig.data)
      : await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: model,
            messages: messagesForApi,
            temperature: parseFloat(state.apiConfig.temperature) || 0.8,
            response_format: { type: 'json_object' },
          }),
        });

    if (!response.ok) throw new Error(`API请求失败: ${response.status}`);

    const data = await response.json();
    const rawContent = isGemini ? data.candidates[0].content.parts[0].text : data.choices[0].message.content;
    const cleanedContent = rawContent.replace(/^```json\s*|```$/g, '').trim();
    const newDmsData = JSON.parse(cleanedContent);

    if (Array.isArray(newDmsData)) {
      newDmsData.forEach((convo, index) => {
        if (!convo.fanAvatarUrl) {
          const fanAvatars = [
            'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg',
            'https://i.postimg.cc/Qd0Y537F/com-xingin-xhs-20251011153800.png',
          ];
          convo.fanAvatarUrl = fanAvatars[index % fanAvatars.length];
        }
      });

      if (isAddingMore) {
        if (!settings.userDms) settings.userDms = [];
        settings.userDms.push(...newDmsData);
      } else {
        settings.userDms = newDmsData;
      }
      await saveQzoneSettings();
      renderUserDmList(settings.userDms);

      await showCustomAlert('生成成功', `${isAddingMore ? '新的私信已添加！' : '粉丝私信已生成！'}`);
    } else {
      throw new Error('AI返回的数据不是一个有效的数组。');
    }
  } catch (error) {
    console.error('生成User私信失败:', error);
    await showCustomAlert('生成失败', `发生错误: ${error.message}`);
  }
}

/**
 * 【已增强】处理用户点击“触发AI回应”按钮
 */
async function handleTriggerUserDmAiReply() {
  if (currentUserDmFanIndex === null) return;

  const convo = state.qzoneSettings.userDms[currentUserDmFanIndex];
  if (!convo) return;

  const inputEl = document.getElementById('user-dm-input');
  inputEl.placeholder = '等待对方回复中...';
  inputEl.disabled = true;

  const aiResponse = await triggerUserDmAiReply(convo);
  if (aiResponse && aiResponse.length > 0) {
    convo.messages.push(...aiResponse);
    await saveQzoneSettings();
    renderUserDmDetail(convo);
    renderUserDmList(state.qzoneSettings.userDms);
  }

  inputEl.placeholder = '和粉丝聊点什么...';
  inputEl.disabled = false;
  inputEl.focus();
}

/**
 * 【已增强】处理用户点击“重Roll”按钮
 */
async function handleUserDmReroll() {
  if (currentUserDmFanIndex === null) return;

  const convo = state.qzoneSettings.userDms[currentUserDmFanIndex];
  if (!convo || convo.messages.length === 0) return;

  let lastMessageIndex = convo.messages.length - 1;

  while (lastMessageIndex >= 0 && convo.messages[lastMessageIndex].sender === 'char') {
    lastMessageIndex--;
  }

  if (lastMessageIndex < 0 || convo.messages[lastMessageIndex].sender !== 'fan') {
    alert('只能对粉丝的最新回复使用重Roll功能哦。');
    return;
  }

  convo.messages.splice(lastMessageIndex);

  renderUserDmDetail(convo);

  const inputEl = document.getElementById('user-dm-input');
  inputEl.placeholder = '正在重新生成回复...';
  inputEl.disabled = true;

  const aiResponse = await triggerUserDmAiReply(convo);
  if (aiResponse && aiResponse.length > 0) {
    convo.messages.push(...aiResponse);
    renderUserDmDetail(convo);
  }

  await saveQzoneSettings();
  renderUserDmList(state.qzoneSettings.userDms);

  inputEl.placeholder = '和粉丝聊点什么...';
  inputEl.disabled = false;
  inputEl.focus();
}

/**
 * 【V2-已添加左滑删除】渲染User的私信列表
 */
function renderUserDmList(dmsData) {
  const listEl = document.getElementById('user-dm-list-container');
  listEl.innerHTML = '';

  if (!dmsData || dmsData.length === 0) {
    listEl.innerHTML =
      '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">还没有收到任何私信哦</p>';
    return;
  }

  dmsData.forEach((convo, index) => {
    const lastMsg = convo.messages[convo.messages.length - 1];

    const swipeContainer = document.createElement('div');
    swipeContainer.className = 'user-dm-list-item-swipe-container';

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'user-dm-list-item-content';
    contentWrapper.innerHTML = `
            <div class="dm-list-item" data-fan-index="${index}">
                <img src="${convo.fanAvatarUrl}" class="dm-avatar">
                <div class="dm-info">
                    <div class="dm-name-line">
                        <span class="dm-name">${convo.fanName}</span>
                        <span class="dm-persona-tag">${convo.fanPersona}</span>
                    </div>
                    <div class="dm-last-msg">${lastMsg.sender === 'char' ? '你: ' : ''}${lastMsg.text}</div>
                </div>
            </div>
        `;

    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'user-dm-swipe-actions';
    actionsWrapper.innerHTML = `<button class="swipe-action-btn delete" data-fan-index="${index}">删除</button>`;

    swipeContainer.appendChild(contentWrapper);
    swipeContainer.appendChild(actionsWrapper);
    listEl.appendChild(swipeContainer);
  });
}
/**
 * 【全新】处理删除单条用户私信的逻辑
 */
async function handleDeleteUserDmMessage(fanIndex, messageIndex) {
  if (fanIndex === null || messageIndex === null) return;

  const settings = state.qzoneSettings;
  const conversation = settings.userDms[fanIndex];
  if (!conversation) return;

  const messageText = conversation.messages[messageIndex].text.substring(0, 30);
  const confirmed = await showCustomConfirm('删除私信', `确定要删除这条私信吗？\n\n“${messageText}...”`, {
    confirmButtonClass: 'btn-danger',
  });

  if (confirmed) {
    conversation.messages.splice(messageIndex, 1);

    if (conversation.messages.length === 0) {
      settings.userDms.splice(fanIndex, 1);
      await saveQzoneSettings();
      renderUserDmList(settings.userDms);
      showScreen('user-dm-list-screen');
    } else {
      await saveQzoneSettings();
      renderUserDmDetail(conversation);
    }
    alert('私信已删除。');
  }
}

/**
 * 【全新】处理删除整个用户私信对话的逻辑
 */
async function handleDeleteUserDmConversation(fanIndex) {
  const settings = state.qzoneSettings;
  const conversation = settings.userDms[fanIndex];
  if (!conversation) return;

  const confirmed = await showCustomConfirm('删除对话', `确定要删除与“${conversation.fanName}”的全部对话吗？`, {
    confirmButtonClass: 'btn-danger',
  });
  if (confirmed) {
    settings.userDms.splice(fanIndex, 1);
    await saveQzoneSettings();
    renderUserDmList(settings.userDms);
    alert('对话已删除。');
  } else {
    const swipedContent = document.querySelector(`.user-dm-list-item-content.swiped`);
    if (swipedContent) swipedContent.classList.remove('swiped');
  }
}

/**
 * 打开与某个粉丝的私信详情页
 */
function openUserDmDetail(fanIndex) {
  currentUserDmFanIndex = fanIndex;
  const convo = state.qzoneSettings.userDms[fanIndex];
  if (!convo) return;

  renderUserDmDetail(convo);
  showScreen('user-dm-detail-screen');
}

/**
 * 【V2-已添加删除按钮】渲染私信详情页的具体内容
 */
function renderUserDmDetail(conversation) {
  const messagesEl = document.getElementById('user-dm-messages-container');
  const titleEl = document.getElementById('user-dm-detail-title');
  messagesEl.innerHTML = '';
  titleEl.textContent = conversation.fanName;

  const userAvatar = state.qzoneSettings.avatar || defaultAvatar;

  conversation.messages.forEach((msg, index) => {
    const isFan = msg.sender === 'fan';
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isFan ? 'fan' : 'user-self'}`;

    const bubble = document.createElement('div');
    bubble.className = `message-bubble`;

    const avatarHtml = `<img src="${isFan ? conversation.fanAvatarUrl : userAvatar}" class="avatar">`;
    const contentHtml = `<div class="content">${msg.text.replace(/\n/g, '<br>')}</div>`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'user-dm-message-delete-btn';
    deleteBtn.dataset.messageIndex = index;
    deleteBtn.title = '删除';
    deleteBtn.innerHTML = '×';

    bubble.innerHTML = `${avatarHtml}${contentHtml}`;

    wrapper.appendChild(bubble);
    wrapper.appendChild(deleteBtn);

    messagesEl.appendChild(wrapper);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * 【已修复】处理用户在私信详情页发送消息 (仅发送，不触发AI)
 */
async function handleSendUserDm() {
  const inputEl = document.getElementById('user-dm-input');
  const messageText = inputEl.value.trim();
  if (!messageText || currentUserDmFanIndex === null) return;

  const convo = state.qzoneSettings.userDms[currentUserDmFanIndex];

  const newMessage = { sender: 'char', text: messageText };

  convo.messages.push(newMessage);

  inputEl.value = '';
  inputEl.style.height = 'auto';

  renderUserDmDetail(convo);
  renderUserDmList(state.qzoneSettings.userDms);

  await saveQzoneSettings();

  inputEl.focus();
}

/**
 * 【AI回复核心 V2 - 已增强回复丰富度】调用AI生成粉丝的回复 (可以生成多条)
 */
async function triggerUserDmAiReply(conversation) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) {
    console.error('API配置不完整');
    return null;
  }

  const settings = state.qzoneSettings;

  const systemPrompt = `
# 角色扮演任务
你将扮演一个正在和偶像或博主私信的粉丝。

# 你的粉丝人设
- 你的昵称: "${conversation.fanName}"
- 你的性格和背景: "${conversation.fanPersona}"

# 博主信息 (你正在和他/她聊天)
- 微博昵称: ${settings.weiboNickname || settings.nickname}
- 微博职业: ${settings.weiboUserProfession || '未设定'}
- 博主的隐藏人设: ${settings.weiboUserPersona || '一个普通的微博用户。'}

# 对话历史 (最近的5条)
${conversation.messages
  .slice(-5)
  .map(m => `- ${m.sender === 'fan' ? conversation.fanName : '我'}: ${m.text}`)
  .join('\n')}

# 你的任务
根据以上人设和对话历史，生成你接下来的回复。

# 回复规则
1.  **深度扮演**: 你的回复必须【极度符合】你的粉丝人设。语气、用词、情绪都要到位。
2.  **内容丰富**: 不要只回复一句话。你的回复应该包含情绪(激动、失望、好奇等)、思考，或者向博主提出新的问题来推动对话。
3.  **【【【格式铁律】】】**: 你的回复必须是一个【JSON数组】，即使只有一条消息。这个数组可以包含3到8条消息对象，模拟真实聊天中连续发消息的场景。
4.  **对象结构**: 数组中的每个对象都必须是 {"sender": "fan", "text": "你的单条回复内容"}。

现在，请以JSON数组的格式，生成你接下来要发送的1-3条消息。`;

  try {
    const messagesForApi = [{ role: 'user', content: systemPrompt }];
    let isGemini = proxyUrl === GEMINI_API_URL;
    let geminiConfig = toGeminiRequestData(
      model,
      apiKey,
      systemPrompt,
      messagesForApi,
      isGemini,
      state.apiConfig.temperature,
    );

    const response = isGemini
      ? await fetch(geminiConfig.url, geminiConfig.data)
      : await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: model,
            messages: messagesForApi,
            temperature: 1.0,
            response_format: { type: 'json_object' },
          }),
        });

    if (!response.ok) throw new Error(`API请求失败: ${response.status}`);

    const data = await response.json();
    const rawContent = isGemini ? data.candidates[0].content.parts[0].text : data.choices[0].message.content;
    const cleanedContent = rawContent.replace(/^```json\s*|```$/g, '').trim();

    const newMessages = JSON.parse(cleanedContent);

    return Array.isArray(newMessages) ? newMessages : [newMessages];
  } catch (error) {
    console.error('触发粉丝回复失败:', error);
    await showCustomAlert('回复生成失败', `发生错误: ${error.message}`);
    return [{ sender: 'fan', text: `(AI生成回复时出错了: ${error.message})` }];
  }
}

/**
 * 清空所有User的私信
 */
async function handleClearAllUserDms() {
  const confirmed = await showCustomConfirm('确认清空', '确定要清空所有粉丝私信吗？此操作不可恢复。', {
    confirmButtonClass: 'btn-danger',
  });
  if (confirmed) {
    state.qzoneSettings.userDms = [];
    await saveQzoneSettings();
    renderUserDmList([]);
    alert('所有私信已清空。');
  }
}

/**
 * 【总入口】当用户点击关注列表时，打开私信界面
 * @param {object} targetInfo - 包含被点击角色/NPC信息的对象
 */
async function openWeiboDms(targetInfo) {
  currentViewingDmsFor = targetInfo;
  const charId = targetInfo.isNpc ? targetInfo.ownerId : targetInfo.id;
  const chat = state.chats[charId];
  if (!chat) return;

  const dmsData = await generateAndCacheFanDms(chat);

  renderDmList(dmsData, targetInfo.name);

  showScreen('weibo-dm-list-screen');
}

/**
 * 【AI核心】检查或生成角色的粉丝私信数据
 * @param {object} characterChat - 角色/NPC的 "主人" 的聊天对象
 * @returns {Promise<Array>} - 粉丝私信对话数组
 */
async function generateAndCacheFanDms(characterChat, addMore = false) {
  if (!addMore && characterChat.weiboDms && characterChat.weiboDms.length > 0) {
    console.log(`从缓存加载 "${characterChat.name}" 的粉丝私信。`);
    return characterChat.weiboDms;
  }

  const alertMessage = addMore ? '正在生成更多私信内容...' : `正在为“${characterChat.name}”生成粉丝私信内容...`;
  await showCustomAlert('请稍候...', alertMessage);

  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) {
    alert('请先配置API！');
    return [];
  }

  const truncatedMainPersona = (characterChat.settings.aiPersona || '一个普通的角色').substring(0, 500);
  const truncatedWeiboInstruction = (characterChat.settings.weiboInstruction || '无特殊指令').substring(0, 400);

  const existingDmsContext = addMore
    ? `
# 已有私信记录 (供你参考，你可以选择延续对话或开启新对话):
${JSON.stringify(characterChat.weiboDms, null, 2)}
`
    : '';

  const systemPrompt = `
# 任务
你现在是角色“${characterChat.name}”的社交媒体运营助理。
你的任务是根据该角色的【所有信息】，虚构一个包含${
    addMore ? '2-3' : '3-5'
  }位不同粉丝的私信列表，并为每位粉丝创作一段生动、真实的对话历史。
${existingDmsContext}

# 角色信息 (你必须综合参考以下所有信息)
- 角色名: ${characterChat.name}
- 公开职业: ${characterChat.settings.weiboProfession || '未设定'}
- 核心人设 (最高优先级): ${truncatedMainPersona}
- 微博互动准则 (处理私信时需遵守): ${truncatedWeiboInstruction}

# 核心规则
1.  **粉丝多样性**: 创作${
    addMore ? '2-3' : '3-5'
  }位不同类型的粉丝（例如：狂热粉、事业粉、CP粉、黑粉、路人粉、广告商等）。
2.  **【【【对话鲜活度铁律】】】**: 为了让对话更真实，你必须：
    -   **避免机械问答**：不要生成“你好”-“你好”之类的无意义对话。让对话像一个正在进行的真实互动片段。
    -   **注入情绪和语气**：粉丝的语气可以是兴奋的、担忧的、质疑的、开玩笑的。角色的回应也要符合人设，可能是冷淡的、温柔的、官方的，或者干脆已读不回。
    -   **使用网络语言**: 适当加入符合粉丝圈文化的网络用语、emoji或颜文字，让对话更接地气。
    -   **内容多样化**: 私信内容不应只局限于工作，也可以是粉丝分享自己的日常、表达关心、提出一些私人问题等。
3.  **角色回应**: 根据角色的【微博互动准则】和【核心人设】，决定角色是否会回复私信以及如何回复。例如，一个高冷的角色可能只会回复重要信息，或者干脆不回复。
4.  **格式铁律**: 你的回复【必须且只能】是一个严格的JSON数组，直接以 '[' 开头，以 ']' 结尾。

# JSON对象结构 (注意：你不再需要提供头像URL)
{
  "fanName": "粉丝的微博昵称",
  "fanPersona": "对这位粉丝的简单描述 (例如: '一个担心哥哥事业的妈妈粉')",
  "messages": [
    { "sender": "fan", "text": "粉丝发的第一条消息..." },
    { "sender": "char", "text": "角色回复的消息..." }
  ]
}

现在，请开始生成私信列表。`;

  try {
    const messagesForApi = [{ role: 'user', content: systemPrompt }];
    let isGemini = proxyUrl === GEMINI_API_URL;
    let geminiConfig = toGeminiRequestData(
      model,
      apiKey,
      systemPrompt,
      messagesForApi,
      isGemini,
      state.apiConfig.temperature,
    );

    const response = isGemini
      ? await fetch(geminiConfig.url, geminiConfig.data)
      : await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: model,
            messages: messagesForApi,
            temperature: parseFloat(state.apiConfig.temperature) || 0.8,
            response_format: { type: 'json_object' },
          }),
        });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} - ${await response.text()}`);
    }

    const data = await response.json();
    const rawContent = isGemini ? data.candidates[0].content.parts[0].text : data.choices[0].message.content;
    const cleanedContent = rawContent.replace(/^```json\s*|```$/g, '').trim();
    const newDmsData = JSON.parse(cleanedContent);
    if (Array.isArray(newDmsData)) {
      const fanAvatars = [
        'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg',
        'https://i.postimg.cc/Qd0Y537F/com-xingin-xhs-20251011153800.png',
      ];

      newDmsData.forEach((convo, index) => {
        convo.fanAvatarUrl = fanAvatars[index % fanAvatars.length];
      });
    }

    if (Array.isArray(newDmsData)) {
      if (!characterChat.weiboDms) characterChat.weiboDms = [];
      if (addMore) {
        characterChat.weiboDms.push(...newDmsData);
      } else {
        characterChat.weiboDms = newDmsData;
      }
      await db.chats.put(characterChat);
      return characterChat.weiboDms;
    }
    throw new Error('AI返回的数据不是一个有效的数组。');
  } catch (error) {
    console.error('生成粉丝私信失败:', error);
    await showCustomAlert('生成失败', `抱歉，生成私信时发生了一个错误。\n\n详细信息:\n${error.message}`);
    return characterChat.weiboDms || [];
  }
}

/**
 * 渲染粉丝私信列表
 * @param {Array} dmsData - 私信对话数组
 * @param {string} charName - 角色名
 */
function renderDmList(dmsData, charName) {
  const listEl = document.getElementById('weibo-dm-list');
  const titleEl = document.getElementById('weibo-dm-list-title');
  listEl.innerHTML = '';
  titleEl.textContent = `${charName}的私信`;

  if (!dmsData || dmsData.length === 0) {
    listEl.innerHTML =
      '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">还没有收到任何私信哦</p>';
    return;
  }

  dmsData.forEach((convo, index) => {
    const lastMsg = convo.messages[convo.messages.length - 1];
    const item = document.createElement('div');
    item.className = 'dm-list-item';
    item.dataset.fanIndex = index;
    item.innerHTML = `
            <img src="${convo.fanAvatarUrl}" class="dm-avatar">
            <div class="dm-info">
                <div class="dm-name">${convo.fanName}</div>
                <div class="dm-last-msg">${lastMsg.text}</div>
            </div>
        `;
    listEl.appendChild(item);
  });
}

/**
 * 打开私信详情页
 * @param {number} fanIndex - 粉丝在私信数组中的索引
 */
function openDmDetail(fanIndex) {
  const charId = currentViewingDmsFor.isNpc ? currentViewingDmsFor.ownerId : currentViewingDmsFor.id;
  const chat = state.chats[charId];
  const conversation = chat.weiboDms[fanIndex];

  if (conversation) {
    document.getElementById('weibo-dm-detail-screen').dataset.currentFanIndex = fanIndex; // Store index
    renderDmDetail(conversation, chat);
    showScreen('weibo-dm-detail-screen');
  }
}

/**
 * 渲染私信详情页的聊天气泡
 * @param {object} conversation - 单个粉丝的对话对象
 * @param {object} characterChat - 角色的聊天对象
 */
function renderDmDetail(conversation, characterChat) {
  const messagesEl = document.getElementById('weibo-dm-messages');
  const titleEl = document.getElementById('weibo-dm-detail-title');
  messagesEl.innerHTML = '';
  titleEl.textContent = conversation.fanName;

  const charAvatar = characterChat.settings.weiboAvatar || characterChat.settings.aiAvatar || defaultAvatar;

  conversation.messages.forEach((msg, index) => {
    const isFan = msg.sender === 'fan';
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isFan ? 'fan' : 'char'}`;

    const bubble = document.createElement('div');
    bubble.className = `message-bubble`;

    const avatarHtml = `<img src="${isFan ? conversation.fanAvatarUrl : charAvatar}" class="avatar">`;
    const contentHtml = `<div class="content">${msg.text.replace(/\n/g, '<br>')}</div>`;

    const deleteBtnHtml = isFan ? `<button class="dm-message-delete-btn" data-message-index="${index}">×</button>` : '';

    bubble.innerHTML = `${avatarHtml}${contentHtml}`;
    wrapper.innerHTML = deleteBtnHtml;
    wrapper.appendChild(bubble);

    messagesEl.appendChild(wrapper);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}
/**
 * 【全新】清空当前角色的所有粉丝私信
 */
async function handleClearAllDms() {
  if (!currentViewingDmsFor) return;

  const charId = currentViewingDmsFor.isNpc ? currentViewingDmsFor.ownerId : currentViewingDmsFor.id;
  const chat = state.chats[charId];
  if (!chat || !chat.weiboDms || chat.weiboDms.length === 0) {
    alert('没有可以清空的私信。');
    return;
  }

  const confirmed = await showCustomConfirm(
    '确认清空',
    `确定要清空“${currentViewingDmsFor.name}”收到的所有粉丝私信吗？此操作不可恢复。`,
    { confirmButtonClass: 'btn-danger' },
  );

  if (confirmed) {
    chat.weiboDms = []; // 清空数组
    await db.chats.put(chat); // 保存到数据库
    renderDmList(chat.weiboDms, currentViewingDmsFor.name); // 重新渲染列表
    alert('所有私信已清空。');
  }
}

/**
 * 处理删除单条私信的逻辑
 * @param {number} fanIndex - 粉丝对话的索引
 * @param {number} messageIndex - 要删除的消息的索引
 */
async function handleDeleteWeiboDm(fanIndex, messageIndex) {
  const charId = currentViewingDmsFor.isNpc ? currentViewingDmsFor.ownerId : currentViewingDmsFor.id;
  const chat = state.chats[charId];
  if (!chat || !chat.weiboDms[fanIndex]) return;

  const conversation = chat.weiboDms[fanIndex];
  const messageText = conversation.messages[messageIndex].text.substring(0, 30);

  const confirmed = await showCustomConfirm('删除私信', `确定要删除这条私信吗？\n\n“${messageText}...”`, {
    confirmButtonClass: 'btn-danger',
  });

  if (confirmed) {
    conversation.messages.splice(messageIndex, 1);

    if (conversation.messages.length === 0) {
      chat.weiboDms.splice(fanIndex, 1);
      await db.chats.put(chat);
      renderDmList(chat.weiboDms, currentViewingDmsFor.name);
      showScreen('weibo-dm-list-screen');
    } else {
      await db.chats.put(chat);
      renderDmDetail(conversation, chat);
    }
    alert('私信已删除。');
  }
}

/**
 * 处理点击“继续生成”按钮的逻辑
 */
async function handleGenerateMoreDms() {
  const charId = currentViewingDmsFor.isNpc ? currentViewingDmsFor.ownerId : currentViewingDmsFor.id;
  const chat = state.chats[charId];
  if (!chat) return;

  const newDmsData = await generateAndCacheFanDms(chat, true);

  renderDmList(newDmsData, currentViewingDmsFor.name);
}

const setupFileUpload = (inputId, callback) => {
  document.getElementById(inputId).addEventListener('change', async event => {
    const file = event.target.files[0];
    if (file) {
      try {
        // 调用新的通用压缩函数
        const compressedDataUrl = await handleImageUploadAndCompress(file);
        callback(compressedDataUrl); // 将压缩后的结果传给回调
      } catch (error) {
        console.error(`处理文件 ${file.name} 失败:`, error);
        alert(`处理图片失败: ${error.message}`);
      } finally {
        event.target.value = null;
      }
    }
  });
};

// ===================================================================
// 3. Weibo Event Listeners
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
  const weiboAppIcon = document.getElementById('weibo-app-icon');
  if (weiboAppIcon) {
    weiboAppIcon.addEventListener('click', async () => {
      try {
        // 先切换屏幕，确保DOM元素存在
        showScreen('weibo-screen');
        // 等待一下确保DOM渲染完成
        await new Promise(resolve => setTimeout(resolve, 50));
        // 然后渲染内容
        await renderWeiboProfile();
        await renderMyWeiboFeed();
        await switchToWeiboView('weibo-my-profile-view');
      } catch (error) {
        console.error('打开微博时出错:', error);
        // 即使出错也显示微博界面
        showScreen('weibo-screen');
      }
    });
  } else {
    console.error('微博图标元素未找到: weibo-app-icon');
  }

  document.getElementById('weibo-screen').addEventListener('click', async e => {
    const avatarWrapper = e.target.closest('.weibo-post-avatar-clickable');
    if (avatarWrapper) {
      const charId = avatarWrapper.dataset.charId;
      if (charId && charId !== 'user') {
        openWeiboCharProfile(charId);
      }
      return;
    }

    const target = e.target;
    const deleteBtn = target.closest('.weibo-post-delete-btn');
    if (deleteBtn) {
      const postItem = deleteBtn.closest('.weibo-post-item');
      if (postItem) {
        const confirmed = await showCustomConfirm('删除动态', '确定要删除这条动态吗？（此操作仅在本页面生效）', {
          confirmButtonClass: 'btn-danger',
        });

        if (confirmed) {
          postItem.style.transition = 'opacity 0.3s, transform 0.3s';
          postItem.style.opacity = '0';
          postItem.style.transform = 'scale(0.95)';
          setTimeout(() => {
            postItem.remove();
          }, 300);
        }
      }
      return;
    }

    if (target.classList.contains('weibo-post-image') && target.dataset.hiddenText) {
      showCustomAlert('图片内容', target.dataset.hiddenText.replace(/<br>/g, '\n'));
      return;
    }

    const postItem = target.closest('.weibo-post-item');
    const postId = postItem ? parseInt(postItem.dataset.postId) : null;

    const deleteCommentBtn = target.closest('.comment-delete-btn');
    if (deleteCommentBtn) {
      const commentItem = deleteCommentBtn.closest('.weibo-comment-item');
      if (postId && commentItem && commentItem.dataset.commentId) {
        deleteWeiboComment(postId, commentItem.dataset.commentId);
      }
      return;
    }

    const generateBtn = target.closest('.generate-comments-btn');
    if (generateBtn) {
      if (postId) {
        generateWeiboComments(postId);
      }
      return;
    }

    const navItem = target.closest('.weibo-nav-item');
    if (navItem && navItem.dataset.view) {
      switchToWeiboView(navItem.dataset.view);
      return;
    }

    const actionsBtn = target.closest('.post-actions-btn');
    if (actionsBtn) {
      const postId = parseInt(actionsBtn.dataset.postId);
      const confirmed = await showCustomConfirm('删除微博', '确定要永久删除这条微博吗？此操作不可恢复。', {
        confirmButtonClass: 'btn-danger',
      });
      if (confirmed && !isNaN(postId)) {
        await db.weiboPosts.delete(postId);
        await renderMyWeiboFeed();
        await renderFollowingWeiboFeed();
        await renderWeiboProfile();
        alert('微博已删除。');
      }
      return;
    }

    if (target.closest('.like-btn')) {
      if (postId) handleWeiboLike(postId);
      return;
    }
    if (target.closest('.weibo-comment-send-btn')) {
      const input = postItem.querySelector('.weibo-comment-input');
      if (postId && input) handleWeiboComment(postId, input);
      return;
    }

    const commentItem = target.closest('.weibo-comment-item');
    if (commentItem) {
      const commenterName = commentItem.dataset.commenterName;
      const commentId = commentItem.dataset.commentId;
      const input = postItem.querySelector('.weibo-comment-input');
      if (input.dataset.replyToId === commentId) {
        input.placeholder = '留下你的精彩评论吧...';
        delete input.dataset.replyToId;
        delete input.dataset.replyToNickname;
      } else {
        input.placeholder = `回复 @${commenterName}:`;
        input.dataset.replyToId = commentId;
        input.dataset.replyToNickname = commenterName;
        input.focus();
      }
      return;
    }
  });

  document.getElementById('weibo-profile-page').addEventListener('click', async e => {
    const target = e.target;

    if (target.id === 'weibo-avatar-img' || target.closest('.weibo-avatar-container')) {
      const choice = await showChoiceModal('编辑头像', [
        { text: '更换头像图片', value: 'avatar' },
        { text: '更换头像框', value: 'frame' },
      ]);

      if (choice === 'avatar') {
        editWeiboAvatar();
      } else if (choice === 'frame') {
        openFrameSelectorModal('weibo_profile');
      }
      return;
    } else if (target.id === 'weibo-nickname') {
      editWeiboNickname();
    } else if (target.id === 'weibo-user-profession-display') {
      openWeiboUserSettingsModal();
    } else if (target.id === 'weibo-background-img') {
      editWeiboBackground();
    } else if (target.closest('#weibo-fans-item')) {
      editWeiboFansCount();
    }
  });

  document.getElementById('weibo-following-btn').addEventListener('click', showFollowingList);
  document.getElementById('create-weibo-post-btn').addEventListener('click', openWeiboPublisherClean);
  document.getElementById('close-following-list-btn').addEventListener('click', () => {
    document.getElementById('weibo-following-modal').classList.remove('visible');
  });
  document.getElementById('clear-following-feed-btn').addEventListener('click', clearFollowingFeed);

  document.getElementById('edit-weibo-profile-btn').addEventListener('click', openWeiboUserSettingsModal);
  document.getElementById('cancel-weibo-user-settings-btn').addEventListener('click', () => {
    document.getElementById('weibo-user-settings-modal').classList.remove('visible');
  });
  document.getElementById('save-weibo-user-settings-btn').addEventListener('click', saveWeiboUserSettings);
  document.getElementById('weibo-user-preset-select').addEventListener('change', handleWeiboUserPresetSelection);
  document.getElementById('manage-weibo-user-presets-btn').addEventListener('click', openWeiboUserPresetManager);

  document.getElementById('generate-hot-search-btn').addEventListener('click', async () => {
    const targets = await showMultiCharacterSelectorForWeibo();
    if (targets) {
      await generateHotSearch(targets);
    }
  });
  document.getElementById('generate-plaza-feed-btn').addEventListener('click', async () => {
    const targets = await showMultiCharacterSelectorForWeibo();
    if (targets) {
      await generatePlazaFeed(null, targets);
    }
  });

  document.getElementById('back-from-hottopic-btn').addEventListener('click', () => {
    switchToWeiboView('weibo-hot-search-view');
  });

  document.getElementById('refresh-hottopic-feed-btn').addEventListener('click', () => {
    if (currentHotTopic) {
      generateHotSearchFeed(currentHotTopic);
    }
  });

  // 【已修复】关注列表点击事件：区分主页按钮、操作按钮和私信
  document.getElementById('weibo-following-list-container').addEventListener('click', e => {
    const item = e.target.closest('.weibo-following-item');
    if (!item) return;

    // 1. 检查是否点击了【操作图标】
    const triggerBtn = e.target.closest('.weibo-action-trigger-btn');
    if (triggerBtn) {
      const targetInfo = {
        id: triggerBtn.dataset.targetId,
        name: triggerBtn.dataset.targetName,
        isNpc: triggerBtn.dataset.isNpc === 'true',
        ownerId: triggerBtn.dataset.ownerId || null,
      };
      openWeiboActionModal(targetInfo);
      return; // 处理完直接退出
    }

    // 2. ★★★ 核心修复：检查是否点击了【主页按钮】 ★★★
    const profileBtn = e.target.closest('.view-profile-btn');
    if (profileBtn) {
      const charId = profileBtn.dataset.charId;
      if (charId) {
        // 关闭关注列表弹窗
        document.getElementById('weibo-following-modal').classList.remove('visible');
        // 打开角色微博主页
        openWeiboCharProfile(charId);
      }
      return; // 处理完直接退出
    }

    // 3. 如果既不是操作按钮，也不是主页按钮，则默认打开私信
    document.getElementById('weibo-following-modal').classList.remove('visible');

    // 为了打开私信，我们需要获取这一行绑定的数据（通常存在 actionBtn 上）
    const actionBtn = item.querySelector('.weibo-action-trigger-btn');
    if (actionBtn) {
      const targetInfo = {
        id: actionBtn.dataset.targetId,
        name: actionBtn.dataset.targetName,
        isNpc: actionBtn.dataset.isNpc === 'true',
        ownerId: actionBtn.dataset.ownerId || null,
      };
      openWeiboDms(targetInfo);
    }
  });

  document.getElementById('cancel-weibo-action-btn').addEventListener('click', () => {
    document.getElementById('weibo-action-modal').classList.remove('visible');
  });

  document.getElementById('confirm-weibo-action-btn').addEventListener('click', handleWeiboAiAction);

  const userDmBtn = document.getElementById('weibo-my-dms-btn');
  if (userDmBtn) {
    userDmBtn.addEventListener('click', openUserDmListScreen);
  }

  document.getElementById('back-from-user-dm-list').addEventListener('click', () => {
    showScreen('weibo-screen');
    switchToWeiboView('weibo-my-profile-view');
  });

  document.getElementById('generate-new-user-dms-btn').addEventListener('click', () => generateUserDms(true));
  document.getElementById('clear-all-user-dms-btn').addEventListener('click', handleClearAllUserDms);

  document.getElementById('user-dm-list-container').addEventListener('click', e => {
    const item = e.target.closest('.dm-list-item');
    if (item && item.dataset.fanIndex) {
      openUserDmDetail(parseInt(item.dataset.fanIndex));
    }
  });

  document.getElementById('back-from-dm-detail').addEventListener('click', () => {
    showScreen('user-dm-list-screen');
  });
  // 补丁：修复User私信详情页返回按钮失效的问题
  const backBtnUserDm = document.getElementById('back-from-user-dm-detail');
  if (backBtnUserDm) {
    backBtnUserDm.addEventListener('click', () => {
      showScreen('user-dm-list-screen');
    });
  }

  document.getElementById('user-dm-send-btn').addEventListener('click', handleSendUserDm);
  document.getElementById('user-dm-input').addEventListener('keypress', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('user-dm-send-btn').click();
    }
  });

  document.getElementById('user-dm-trigger-ai-btn').addEventListener('click', handleTriggerUserDmAiReply);
  document.getElementById('user-dm-reroll-btn').addEventListener('click', handleUserDmReroll);

  document.getElementById('user-dm-messages-container').addEventListener('click', e => {
    const deleteBtn = e.target.closest('.user-dm-message-delete-btn');
    if (deleteBtn) {
      const messageIndex = parseInt(deleteBtn.dataset.messageIndex);
      if (currentUserDmFanIndex !== null && !isNaN(messageIndex)) {
        handleDeleteUserDmMessage(currentUserDmFanIndex, messageIndex);
      }
    }
  });

  const userDmListEl = document.getElementById('user-dm-list-container');
  let userDmSwipeState = { isDragging: false, startX: 0, activeContent: null };

  function resetAllUserDmSwipes(exceptThisOne = null) {
    document.querySelectorAll('.user-dm-list-item-content.swiped').forEach(content => {
      if (content !== exceptThisOne) {
        content.classList.remove('swiped');
      }
    });
  }

  userDmListEl.addEventListener('mousedown', e => {
    const content = e.target.closest('.user-dm-list-item-content');
    if (content) {
      resetAllUserDmSwipes(content);
      userDmSwipeState = { isDragging: true, startX: e.pageX, activeContent: content };
      e.preventDefault();
    }
  });
  userDmListEl.addEventListener(
    'touchstart',
    e => {
      const content = e.target.closest('.user-dm-list-item-content');
      if (content) {
        resetAllUserDmSwipes(content);
        userDmSwipeState = { isDragging: true, startX: e.touches[0].pageX, activeContent: content };
      }
    },
    { passive: true },
  );

  document.addEventListener('mousemove', e => {
    if (!userDmSwipeState.isDragging || !userDmSwipeState.activeContent) return;
    const diffX = e.pageX - userDmSwipeState.startX;
    if (diffX < 0 && diffX > -90) {
      userDmSwipeState.activeContent.style.transition = 'none';
      userDmSwipeState.activeContent.style.transform = `translateX(${diffX}px)`;
    }
  });
  document.addEventListener(
    'touchmove',
    e => {
      if (!userDmSwipeState.isDragging || !userDmSwipeState.activeContent) return;
      const diffX = e.touches[0].pageX - userDmSwipeState.startX;
      if (diffX < 0 && diffX > -90) {
        userDmSwipeState.activeContent.style.transition = 'none';
        userDmSwipeState.activeContent.style.transform = `translateX(${diffX}px)`;
      }
    },
    { passive: true },
  );

  const handleUserDmSwipeEnd = e => {
    if (!userDmSwipeState.isDragging || !userDmSwipeState.activeContent) return;

    const content = userDmSwipeState.activeContent;
    content.style.transition = 'transform 0.3s ease';
    const transformStyle = window.getComputedStyle(content).transform;
    const currentTranslateX = new DOMMatrix(transformStyle).m41;

    if (currentTranslateX < -40) {
      content.classList.add('swiped');
    } else {
      content.classList.remove('swiped');
    }
    content.style.transform = '';

    userDmSwipeState = { isDragging: false, activeContent: null };
  };
  document.addEventListener('mouseup', handleUserDmSwipeEnd);
  document.addEventListener('touchend', handleUserDmSwipeEnd);

  userDmListEl.addEventListener('click', e => {
    if (e.target.classList.contains('swipe-action-btn') && e.target.classList.contains('delete')) {
      const fanIndex = parseInt(e.target.dataset.fanIndex);
      if (!isNaN(fanIndex)) {
        handleDeleteUserDmConversation(fanIndex);
      }
    }
  });

  document.getElementById('back-from-dm-list').addEventListener('click', () => {
    showScreen('weibo-screen');
    switchToWeiboView('weibo-my-profile-view');
  });

  document.getElementById('back-from-dm-detail').addEventListener('click', () => {
    showScreen('weibo-dm-list-screen');
  });

  document.getElementById('generate-more-dms-btn').addEventListener('click', handleGenerateMoreDms);
  document.getElementById('clear-all-dms-btn').addEventListener('click', handleClearAllDms);

  document.getElementById('weibo-dm-list').addEventListener('click', e => {
    const item = e.target.closest('.dm-list-item');
    if (item && item.dataset.fanIndex) {
      openDmDetail(parseInt(item.dataset.fanIndex));
    }
  });

  document.getElementById('weibo-dm-messages').addEventListener('click', e => {
    const deleteBtn = e.target.closest('.dm-message-delete-btn');
    if (deleteBtn) {
      const fanIndex = parseInt(
        document.querySelector('.dm-list-item.active')?.dataset.fanIndex ??
          document.getElementById('weibo-dm-detail-screen').dataset.currentFanIndex,
      );
      const messageIndex = parseInt(deleteBtn.dataset.messageIndex);

      const conversation = state.chats[
        currentViewingDmsFor.isNpc ? currentViewingDmsFor.ownerId : currentViewingDmsFor.id
      ].weiboDms.find(convo => convo.fanName === document.getElementById('weibo-dm-detail-title').textContent);
      const fanIdx =
        state.chats[
          currentViewingDmsFor.isNpc ? currentViewingDmsFor.ownerId : currentViewingDmsFor.id
        ].weiboDms.indexOf(conversation);

      if (!isNaN(fanIdx) && !isNaN(messageIndex)) {
        handleDeleteWeiboDm(fanIdx, messageIndex);
      }
    }
  });

  document.getElementById('back-from-char-profile').addEventListener('click', () => {
    showScreen('weibo-screen');
  });

  document.getElementById('edit-char-weibo-profile-btn').addEventListener('click', openCharWeiboEditor);

  document.getElementById('char-weibo-editor-modal').addEventListener('click', e => {
    if (e.target.classList.contains('change-frame-btn')) {
      const type = e.target.dataset.type;
      const targetId = currentViewingWeiboProfileId;
      openFrameSelectorModal(type, targetId);
    } else if (e.target.id === 'cancel-char-weibo-editor-btn') {
      document.getElementById('char-weibo-editor-modal').classList.remove('visible');
    } else if (e.target.id === 'save-char-weibo-editor-btn') {
      saveCharWeiboProfile();
    }
  });

  document.getElementById('weibo-char-profile-page').addEventListener('click', async e => {
    if (!currentViewingWeiboProfileId) return;
    const chat = state.chats[currentViewingWeiboProfileId];
    if (!chat) return;

    if (e.target.closest('#weibo-char-following-item')) {
      const newFollowing = await showCustomPrompt('编辑关注数', '请输入新的关注数:', chat.settings.weiboFollowingCount);
      if (newFollowing !== null) {
        chat.settings.weiboFollowingCount = newFollowing.trim() || '0';
        await db.chats.put(chat);
        await renderWeiboCharProfile(currentViewingWeiboProfileId);
      }
    } else if (e.target.closest('#weibo-char-fans-item')) {
      const newFans = await showCustomPrompt(
        '编辑粉丝数',
        "请输入新的粉丝数 (支持'万'/'亿'):",
        chat.settings.weiboFansCount,
      );
      if (newFans !== null) {
        chat.settings.weiboFansCount = newFans.trim() || '0';
        await db.chats.put(chat);
        await renderWeiboCharProfile(currentViewingWeiboProfileId);
      }
    }
  });

  setupFileUpload('char-weibo-editor-avatar-input', base64 => {
    document.getElementById('char-weibo-editor-avatar-preview').src = base64;
  });
  setupFileUpload('char-weibo-editor-bg-input', base64 => {
    document.getElementById('char-weibo-editor-bg-preview').src = base64;
  });
});
