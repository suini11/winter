// 拆分机app - 帮助用户将目标拆分成小任务
let activeTaskSplitterCharId = null;
let currentTaskData = null; // 存储当前任务数据
let isSyncingFromCalendar = false; // 标志：是否正在从月历同步，防止循环同步

/**
 * 【总入口】打开拆分机功能
 */
async function openTaskSplitter() {
  const characters = Object.values(state.chats).filter(chat => !chat.isGroup);
  
  if (characters.length === 0) {
    await showCustomAlert('提示', '还没有可以使用的角色');
    return;
  }

  // 获取第一个置顶角色，如果没有则获取第一个角色
  const pinnedChars = characters.filter(char => char.isPinned);
  const defaultChar = pinnedChars.length > 0 ? pinnedChars[0] : characters[0];
  
  // 直接使用默认角色打开主界面
  await openTaskSplitterWithChar(defaultChar.id);
}

/**
 * 使用指定角色打开拆分机主界面
 * @param {string} charId - 角色ID
 */
async function openTaskSplitterWithChar(charId) {
  activeTaskSplitterCharId = charId;
  const chat = state.chats[charId];
  if (!chat) return;

  // 隐藏对话气泡
  hideDialogBubble();
  
  // 显示主界面
  showScreen('task-splitter-main-screen');
  
  // 检查是否有保存的进度
  const savedProgress = loadTaskProgress(charId);
  if (savedProgress && savedProgress.taskGroups && savedProgress.taskGroups.length > 0) {
    // 恢复保存的进度
    currentTaskData = {
      charId: savedProgress.charId,
      goal: savedProgress.goal,
      goalType: savedProgress.goalType || 'short',
      currentStatus: savedProgress.currentStatus,
      startMessage: savedProgress.startMessage,
      endMessage: savedProgress.endMessage,
      reward: savedProgress.reward || '恭喜你完成了目标！', // 奖励内容
      rewardVisualization: savedProgress.rewardVisualization || '', // 奖励可视化代码
      taskGroups: savedProgress.taskGroups,
      completedTasks: new Set(savedProgress.completedTasks || []),
      createdAt: savedProgress.createdAt,
      calendarTaskIds: savedProgress.calendarTaskIds || [],
    };
    
    // 如果是长线目标但还没有添加到月历，尝试添加（异步执行，不阻塞界面）
    if (currentTaskData.goalType === 'long') {
      // 检查月历中是否已有任务（验证数据完整性）
      const hasCalendarTasks = currentTaskData.calendarTaskIds && currentTaskData.calendarTaskIds.length > 0;
      if (!hasCalendarTasks) {
        console.log('恢复进度：检测到长线目标但月历中没有任务，开始添加...');
        // 异步执行，不阻塞界面渲染
        addTasksToCalendar(currentTaskData.taskGroups, charId).catch(error => {
          console.error('添加任务到月历失败:', error);
        });
      } else {
        console.log('恢复进度：月历中已有任务，跳过添加');
        // 快速验证：只检查第一个任务是否存在，不全部验证（避免卡顿）
        if (currentTaskData.calendarTaskIds.length > 0) {
          const firstTask = currentTaskData.calendarTaskIds[0];
          try {
            let exists = false;
            if (firstTask.type === 'event') {
              const event = await db.calendarEvents.get(firstTask.id);
              exists = !!event;
            } else {
              const todo = await db.calendarTodos.get(firstTask.id);
              exists = !!todo;
            }
            if (!exists) {
              console.log('恢复进度：月历中的任务已丢失，重新添加...');
              // 异步执行，不阻塞界面渲染
              addTasksToCalendar(currentTaskData.taskGroups, charId).catch(error => {
                console.error('添加任务到月历失败:', error);
              });
            }
          } catch (error) {
            console.warn('验证月历任务失败:', error);
          }
        }
      }
    }
    
    // 检查是否所有任务都已完成
    const allTasksCompleted = currentTaskData.taskGroups.every(group =>
      group.tasks.every(task => currentTaskData.completedTasks.has(task.id))
    );
    
    // 隐藏所有视图，确保没有重叠
    document.getElementById('task-splitter-initial-view').style.display = 'none';
    document.getElementById('task-splitter-current-status-view').style.display = 'none';
    document.getElementById('task-splitter-loading-view').style.display = 'none';
    
    if (allTasksCompleted) {
      // 所有任务已完成，显示完成界面
      // 先渲染任务列表（用于翻页动画）
      renderTaskList();
      // 等待一小段时间让任务列表渲染完成
      await new Promise(resolve => setTimeout(resolve, 100));
      // 然后显示完成界面（带翻页动画）
      await showTaskCompletion();
    } else {
      // 显示任务界面
      renderTaskList();
      // 显示开始语
      if (currentTaskData.startMessage) {
        showDialogBubble(currentTaskData.startMessage);
      }
      
      // 确保按钮事件已绑定（恢复进度时可能没有调用setupTaskSplitterEvents）
      ensureTaskSplitterButtonsBound(chat);
    }
  } else {
    // 没有保存的进度，显示初始界面
    currentTaskData = null;
    // 确保隐藏其他视图
    document.getElementById('task-splitter-current-status-view').style.display = 'none';
    document.getElementById('task-splitter-tasks-view').style.display = 'none';
    document.getElementById('task-splitter-loading-view').style.display = 'none';
    document.getElementById('task-splitter-completion-view').style.display = 'none';
    document.getElementById('task-splitter-help-btn').style.display = 'none';
    const cancelBtn = document.getElementById('task-splitter-cancel-task-btn');
    const switchCharBtn = document.getElementById('task-splitter-switch-char-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (switchCharBtn) switchCharBtn.style.display = 'none';
    
    await renderTaskSplitterInitialView(chat);
  }
  
  // 加载保存的背景图片
  loadTaskSplitterBackground();
}

/**
 * 确保任务拆分器按钮事件已绑定（用于恢复进度时）
 */
function ensureTaskSplitterButtonsBound(chat) {
  // 返回按钮
  const backBtn = document.getElementById('task-splitter-back-btn');
  if (backBtn && !backBtn.hasAttribute('data-bound')) {
    backBtn.onclick = () => {
      // 保存当前进度
      if (currentTaskData) {
        saveTaskProgress();
      }
      hideDialogBubble();
      showScreen('home-screen');
    };
    backBtn.setAttribute('data-bound', 'true');
  }
  
  // 取消任务按钮
  const cancelTaskBtn = document.getElementById('task-splitter-cancel-task-btn');
  if (cancelTaskBtn && !cancelTaskBtn.hasAttribute('data-bound')) {
    cancelTaskBtn.onclick = async () => {
      if (confirm('确定要取消当前任务吗？取消后可以从月历中删除相关任务。')) {
        await cancelCurrentTask();
      }
    };
    cancelTaskBtn.setAttribute('data-bound', 'true');
  }
  
  // 切换角色按钮
  const switchCharBtn = document.getElementById('task-splitter-switch-char-btn');
  if (switchCharBtn && !switchCharBtn.hasAttribute('data-bound')) {
    switchCharBtn.onclick = () => {
      showTaskSplitterCharSelection();
    };
    switchCharBtn.setAttribute('data-bound', 'true');
  }
  
  // 遇到困难按钮
  const helpBtn = document.getElementById('task-splitter-help-btn');
  if (helpBtn && !helpBtn.hasAttribute('data-bound')) {
    helpBtn.onclick = async () => {
      await handleTaskSplitterHelp();
    };
    helpBtn.setAttribute('data-bound', 'true');
  }
  
  // 查看历史按钮
  const historyBtn = document.getElementById('task-splitter-history-btn');
  if (historyBtn && !historyBtn.hasAttribute('data-bound')) {
    historyBtn.onclick = () => {
      openTaskSplitterHistory();
    };
    historyBtn.setAttribute('data-bound', 'true');
  }
  
  // 设置按钮
  const settingsBtn = document.getElementById('task-splitter-image-settings-btn');
  if (settingsBtn && !settingsBtn.hasAttribute('data-bound')) {
    settingsBtn.onclick = () => {
      showTaskSplitterImageSettings();
    };
    settingsBtn.setAttribute('data-bound', 'true');
  }
}

/**
 * 渲染初始界面
 */
async function renderTaskSplitterInitialView(chat) {
  const avatarEl = document.getElementById('task-splitter-char-avatar');
  const greetingEl = document.getElementById('task-splitter-greeting');
  const initialView = document.getElementById('task-splitter-initial-view');
  const currentStatusView = document.getElementById('task-splitter-current-status-view');
  const tasksView = document.getElementById('task-splitter-tasks-view');
  const loadingView = document.getElementById('task-splitter-loading-view');
  
  // 显示初始界面，隐藏其他视图
  initialView.style.display = 'flex';
  currentStatusView.style.display = 'none';
  tasksView.style.display = 'none';
  loadingView.style.display = 'none';
  document.getElementById('task-splitter-help-btn').style.display = 'none';
  
  // 设置头像
  avatarEl.src = chat.settings.aiAvatar || defaultAvatar;
  
  // 设置问候语
  const username = chat.settings.myNickname || state.qzoneSettings.nickname || '你';
  greetingEl.textContent = `${username}，有什麼目標未達成嗎？`;
  
  // 清空输入框
  document.getElementById('task-splitter-goal-input').value = '';
  document.getElementById('task-splitter-current-status-input').value = '';
  
  // 确保目标类型选择器存在
  ensureGoalTypeSelector();
  
  // 绑定事件
  setupTaskSplitterEvents(chat);
  
  // 确保头像完整显示（手机端优化）
  setTimeout(() => {
    const avatarContainer = document.getElementById('task-splitter-char-avatar-container');
    const contentArea = document.getElementById('task-splitter-content-area');
    if (avatarContainer && contentArea) {
      // 检查头像是否在可视区域内
      const avatarRect = avatarContainer.getBoundingClientRect();
      const contentRect = contentArea.getBoundingClientRect();
      
      // 如果头像不在可视区域内或显示不完全，滚动到头像位置
      if (avatarRect.top < contentRect.top || avatarRect.bottom > contentRect.bottom) {
        avatarContainer.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'center'
        });
      }
    }
  }, 100);
}

/**
 * 确保目标类型选择器存在
 */
function ensureGoalTypeSelector() {
  const initialView = document.getElementById('task-splitter-initial-view');
  let typeSelector = document.getElementById('task-splitter-goal-type-selector');
  
  if (!typeSelector) {
    typeSelector = document.createElement('div');
    typeSelector.id = 'task-splitter-goal-type-selector';
    typeSelector.style.cssText = `
      display: flex;
      gap: 15px;
      margin-bottom: 20px;
      justify-content: center;
    `;
    
    const longTermBtn = document.createElement('button');
    longTermBtn.id = 'task-splitter-goal-type-long';
    longTermBtn.textContent = '长线目标';
    longTermBtn.dataset.type = 'long';
    longTermBtn.style.cssText = `
      padding: 10px 20px;
      font-size: 14px;
      background: #e3f2fd;
      color: #1976d2;
      border: 2px solid #1976d2;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.3s;
    `;
    
    const shortTermBtn = document.createElement('button');
    shortTermBtn.id = 'task-splitter-goal-type-short';
    shortTermBtn.textContent = '短期目标';
    shortTermBtn.dataset.type = 'short';
    shortTermBtn.style.cssText = `
      padding: 10px 20px;
      font-size: 14px;
      background: #fff3e0;
      color: #f57c00;
      border: 2px solid #f57c00;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.3s;
    `;
    
    // 默认选中短期目标
    shortTermBtn.style.background = '#f57c00';
    shortTermBtn.style.color = 'white';
    
    let selectedType = 'short';
    
    longTermBtn.onclick = () => {
      selectedType = 'long';
      longTermBtn.style.background = '#1976d2';
      longTermBtn.style.color = 'white';
      shortTermBtn.style.background = '#fff3e0';
      shortTermBtn.style.color = '#f57c00';
      typeSelector.dataset.selectedType = 'long';
    };
    
    shortTermBtn.onclick = () => {
      selectedType = 'short';
      shortTermBtn.style.background = '#f57c00';
      shortTermBtn.style.color = 'white';
      longTermBtn.style.background = '#e3f2fd';
      longTermBtn.style.color = '#1976d2';
      typeSelector.dataset.selectedType = 'short';
    };
    
    typeSelector.appendChild(longTermBtn);
    typeSelector.appendChild(shortTermBtn);
    typeSelector.dataset.selectedType = 'short';
    
    // 插入到问候语和输入框之间
    const greetingEl = document.getElementById('task-splitter-greeting');
    greetingEl.parentNode.insertBefore(typeSelector, greetingEl.nextSibling);
  }
}

/**
 * 设置事件监听
 */
function setupTaskSplitterEvents(chat) {
  // 头像点击选择角色
  document.getElementById('task-splitter-char-avatar-container').onclick = () => {
    showTaskSplitterCharSelection();
  };
  
  // 提交目标按钮
  const submitGoalBtn = document.getElementById('task-splitter-submit-goal-btn');
  submitGoalBtn.onclick = async () => {
    const goalInput = document.getElementById('task-splitter-goal-input');
    const goal = goalInput.value.trim();
    if (!goal) {
      await showCustomAlert('提示', '请输入你的目标');
      return;
    }
    
    // 隐藏初始界面，显示当前状态询问界面
    document.getElementById('task-splitter-initial-view').style.display = 'none';
    document.getElementById('task-splitter-current-status-view').style.display = 'block';
  };
  
  // 提交当前状态按钮
  const submitStatusBtn = document.getElementById('task-splitter-submit-status-btn');
  submitStatusBtn.onclick = async () => {
    const goalInput = document.getElementById('task-splitter-goal-input');
    const statusInput = document.getElementById('task-splitter-current-status-input');
    const goal = goalInput.value.trim();
    const currentStatus = statusInput.value.trim();
    
    if (!currentStatus) {
      await showCustomAlert('提示', '请告诉我你现在在做什么');
      return;
    }
    
    // 获取目标类型
    const typeSelector = document.getElementById('task-splitter-goal-type-selector');
    const goalType = typeSelector ? typeSelector.dataset.selectedType || 'short' : 'short';
    
    // 开始生成任务拆解
    await generateTaskBreakdown(activeTaskSplitterCharId, goal, currentStatus, goalType);
  };
  
  // 回车键提交
  document.getElementById('task-splitter-goal-input').onkeypress = (e) => {
    if (e.key === 'Enter') {
      submitGoalBtn.click();
    }
  };
  
  document.getElementById('task-splitter-current-status-input').onkeypress = (e) => {
    if (e.key === 'Enter') {
      submitStatusBtn.click();
    }
  };
  
  // 返回按钮
  document.getElementById('task-splitter-back-btn').onclick = () => {
    // 保存当前进度
    if (currentTaskData) {
      saveTaskProgress();
    }
    hideDialogBubble();
    showScreen('home-screen');
  };
  
  // 设置按钮（图片区域右上角）
  document.getElementById('task-splitter-image-settings-btn').onclick = () => {
    showTaskSplitterImageSettings();
  };
  
  // 查看历史按钮
  document.getElementById('task-splitter-history-btn').onclick = () => {
    openTaskSplitterHistory();
  };
  
  // 遇到困难按钮
  document.getElementById('task-splitter-help-btn').onclick = async () => {
    await handleTaskSplitterHelp();
  };
  
  // 新增目标按钮
  const newGoalBtn = document.getElementById('task-splitter-new-goal-btn');
  if (newGoalBtn) {
    newGoalBtn.onclick = () => {
      // 清除保存的进度
      clearTaskProgress(activeTaskSplitterCharId);
      // 重置状态，返回初始界面
      currentTaskData = null;
      renderTaskSplitterInitialView(chat);
      hideDialogBubble();
    };
  }
  
  // 取消任务按钮
  const cancelTaskBtn = document.getElementById('task-splitter-cancel-task-btn');
  if (cancelTaskBtn) {
    cancelTaskBtn.onclick = async () => {
      if (confirm('确定要取消当前任务吗？取消后可以从月历中删除相关任务。')) {
        await cancelCurrentTask();
      }
    };
  }
  
  // 切换角色任务进度按钮
  const switchCharBtn = document.getElementById('task-splitter-switch-char-btn');
  if (switchCharBtn) {
    switchCharBtn.onclick = () => {
      showTaskSplitterCharSelection();
    };
  }
  
  // 背景图片设置模态框事件
  setupImageSettingsModal();
}

/**
 * 显示角色选择界面
 */
async function showTaskSplitterCharSelection() {
  const listEl = document.getElementById('task-splitter-char-list');
  if (!listEl) {
    console.error('找不到task-splitter-char-list元素');
    return;
  }
  
  listEl.innerHTML = '';
  const characters = Object.values(state.chats).filter(chat => !chat.isGroup);

  if (characters.length === 0) {
    listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">还没有可以使用的角色</p>';
    showScreen('task-splitter-char-selection-screen');
    return;
  }
  
  // 使用try-catch包装，避免单个角色数据错误导致整个列表无法显示
  for (const char of characters) {
    try {
      const item = document.createElement('div');
      item.className = 'character-select-item';
      item.dataset.chatId = char.id;
      item.style.position = 'relative';
      
      // 检查是否有进行中的任务（使用try-catch避免错误）
      let taskBadgeHtml = '';
      try {
        const taskProgress = loadTaskProgress(char.id);
        const hasActiveTask = taskProgress && taskProgress.taskGroups && taskProgress.taskGroups.length > 0;
        
        if (hasActiveTask) {
          const completedTasks = new Set(taskProgress.completedTasks || []);
          const allTasksCompleted = taskProgress.taskGroups.every(group =>
            group.tasks.every(task => completedTasks.has(task.id))
          );
          
          if (!allTasksCompleted) {
            // 显示任务气泡，包含目标内容
            const goalText = (taskProgress.goal || '进行中的任务').replace(/"/g, '&quot;'); // 转义引号
            // 限制显示长度
            const displayGoal = goalText.length > 20 ? goalText.substring(0, 20) + '...' : goalText;
            taskBadgeHtml = `
              <span class="task-badge" style="
                position: absolute;
                top: 5px;
                right: 5px;
                background: #4CAF50;
                color: white;
                font-size: 10px;
                padding: 4px 8px;
                border-radius: 12px;
                white-space: nowrap;
                max-width: 150px;
                overflow: hidden;
                text-overflow: ellipsis;
                z-index: 10;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              " title="${goalText}">任务中: ${displayGoal}</span>
            `;
          }
        }
      } catch (error) {
        console.warn(`检查角色 ${char.id} 的任务状态失败:`, error);
        // 即使检查失败，也继续显示角色
      }
      
      // 转义HTML特殊字符
      const charName = (char.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const avatarUrl = (char.settings?.aiAvatar || defaultAvatar || '').replace(/"/g, '&quot;');
      
      item.innerHTML = `
        <img src="${avatarUrl}" alt="${charName}">
        <span class="name">${charName}</span>
        ${taskBadgeHtml}
      `;
      item.onclick = () => {
        openTaskSplitterWithChar(char.id);
      };
      listEl.appendChild(item);
    } catch (error) {
      console.error(`渲染角色 ${char.id} 失败:`, error);
      // 即使单个角色失败，也继续处理其他角色
    }
  }
  
  showScreen('task-splitter-char-selection-screen');
}

/**
 * 【AI核心】生成任务拆解
 * @param {string} charId - 角色ID
 * @param {string} goal - 用户目标
 * @param {string} currentStatus - 用户当前状态
 * @param {string} goalType - 目标类型：'long' 或 'short'
 */
async function generateTaskBreakdown(charId, goal, currentStatus, goalType = 'short') {
  const chat = state.chats[charId];
  if (!chat) return;

  // 显示加载动画
  document.getElementById('task-splitter-initial-view').style.display = 'none';
  document.getElementById('task-splitter-current-status-view').style.display = 'none';
  // 隐藏所有视图，只显示加载视图
  document.getElementById('task-splitter-initial-view').style.display = 'none';
  document.getElementById('task-splitter-current-status-view').style.display = 'none';
  document.getElementById('task-splitter-tasks-view').style.display = 'none';
  document.getElementById('task-splitter-completion-view').style.display = 'none';
  document.getElementById('task-splitter-loading-view').style.display = 'block';

  try {
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      throw new Error('API未配置');
    }

    const userNickname = chat.settings.myNickname || state.qzoneSettings.nickname || '我';
    const charName = chat.name;
    const charPersona = chat.settings.aiPersona || '一个友善的助手。';

    // 构建世界书上下文
    const recentHistory = chat.history
      .slice(-10)
      .map(msg => {
        const sender = msg.role === 'user' ? userNickname : charName;
        return `${sender}: ${msg.content}`;
      })
      .join('\n');
    
    const worldBookByPosition = (typeof window.buildWorldBookContentByPosition === 'function')
      ? window.buildWorldBookContentByPosition(chat, recentHistory, false)
      : { all: '' };
    const worldBookContext = worldBookByPosition.all || '';

    const isLongTerm = goalType === 'long';
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const goalTypeInstruction = isLongTerm 
      ? `这是一个长线目标（例如：减肥8kg，半年内学会意大利语）。你需要：

## 时间跨度规划（非常重要！）

**首先分析目标的合理完成时间：**
- 如果用户没有指定完成时间，你必须根据目标类型和难度，合理规划时间跨度
- **例如：减肥8kg不应该10天完成，应该规划2-4个月的时间**
- **例如：学会一门语言不应该1个月完成，应该规划3-6个月甚至更长时间**
- **例如：养成一个习惯不应该1周完成，应该规划至少21天到3个月**

**时间跨度参考：**
- 减肥类：每减1-2kg需要1个月左右，8kg需要3-4个月
- 学习类：基础掌握需要2-3个月，熟练需要6-12个月
- 习惯养成：至少21天，通常需要2-3个月才能稳定
- 技能提升：根据难度，通常需要3-6个月

## 任务分配原则

**1. 根据用户人设分析：**
- 分析用户的人设、性格、行动效率、心情状态、能量水平
- 如果用户是行动力强的类型，可以安排稍密集的任务
- 如果用户是容易疲惫的类型，应该安排更宽松的计划
- 如果用户心情不好或能量低，应该从简单任务开始，循序渐进

**2. 任务密度控制（关键！）：**
- **不要天天换任务！** 这是长线目标，需要持续性和稳定性
- 每个任务应该持续一段时间（至少3-7天），让用户有足够时间适应和巩固
- 例如：不要安排"第1天做A，第2天做B，第3天做C"，应该安排"第1-7天：每天做A，第8-14天：每天做B"
- 任务之间应该有合理的间隔和过渡期

**3. 循序渐进：**
- 从简单、容易完成的任务开始
- 逐步增加难度和强度
- 给用户适应和调整的时间
- 避免一开始就安排过于困难的任务

**4. 可持续性：**
- 考虑用户的日常生活节奏
- 不要安排过于密集的任务，避免用户感到压力过大而放弃
- 留出休息和调整的时间
- 任务应该是可持续的，能够长期坚持的

## 日期分配要求

- **每个任务必须包含具体的完成日期**（scheduledDate字段，格式：YYYY-MM-DD，从今天${todayStr}开始往后分配）
- **每个任务必须包含时间**（scheduledTime字段，格式：HH:mm，例如"09:00"或"14:30"）
- **每个任务必须指定是行程还是待办**（isEvent字段：true=行程，false=待办）

**支持日期范围和重复任务：**
- **日期范围任务**：如果任务需要持续多天（例如"1号到5号每天记录饮食"），使用scheduledEndDate字段（格式：YYYY-MM-DD）
  - 例如：scheduledDate: "2024-01-01", scheduledEndDate: "2024-01-05" 表示1号到5号每天都有这个任务
- **每天重复任务**：如果任务是每天重复的（例如"每天6点跑步一小时"），使用isDaily: true和repeatDays字段
  - isDaily: true 表示这是每天重复的任务
  - repeatDays: 7 表示连续7天（从scheduledDate开始）
  - 例如：scheduledDate: "2024-01-01", isDaily: true, repeatDays: 7, scheduledTime: "06:00" 表示从1号开始，连续7天，每天6点都有这个任务
- **时间范围**：如果任务有开始和结束时间（例如"8点到19点"），使用scheduledEndTime字段（格式：HH:mm）
  - 例如：scheduledTime: "08:00", scheduledEndTime: "19:00" 表示8点到19点
  - 这样在任务列表中会显示为"1月11至20，8点到19点"这样的格式

- 任务应该按时间顺序排列，从近期到远期
- **日期跨度要合理**：如果目标是减肥8kg，总时间跨度应该是3-4个月，不要压缩到1-2周

## 示例

**目标：减肥8kg（用户未指定时间）**
- 合理时间跨度：3-4个月（约90-120天）
- 任务安排示例：
  * 第1-2周（14天）：每天记录饮食，建立基础习惯
  * 第3-4周（14天）：每天运动30分钟，调整饮食结构
  * 第5-8周（28天）：增加运动强度，保持饮食控制
  * 第9-12周（28天）：巩固习惯，持续优化
  * 第13-16周（28天）：维持成果，防止反弹

**目标：学会意大利语（用户未指定时间）**
- 合理时间跨度：6个月（约180天）
- 任务安排示例：
  * 第1-4周：每天学习基础词汇和发音（每天一个待办）
  * 第5-8周：学习基础语法，每天练习（每2-3天一个任务）
  * 第9-16周：开始练习对话和阅读（每周2-3个任务）
  * 第17-24周：深入学习，提高流利度（每周2-3个任务）`
      : `这是一个短期目标。任务应该：
- 具体、可执行
- 可以立即开始
- 不需要特别的时间段分配`;

    const systemPrompt = `# 任务：目标拆分助手

你现在是角色"${charName}"，你的人设是："${charPersona}"

你的任务是帮助用户将一个大目标拆分成多个可执行的小任务。

# 用户信息
- 用户名：${userNickname}
- 目标：${goal}
- 目标类型：${isLongTerm ? '长线目标' : '短期目标'}
- 当前状态：${currentStatus}

${worldBookContext ? `# 世界观设定\n${worldBookContext}\n` : ''}

# 你的任务

1. **分析用户状态**：
   - 根据用户的人设、性格特点，分析用户的行动效率、心情状态、能量水平
   - 根据用户的当前状态"${currentStatus}"，判断用户现在的状态（是充满动力还是疲惫？是积极还是消极？）
   - 根据这些分析，制定适合用户的计划节奏

2. **分析差距和时间跨度**：
   - 分析从"${currentStatus}"到"${goal}"之间的差距
   - **如果用户没有指定完成时间，你必须根据目标类型和难度，合理规划时间跨度**
   - 例如：减肥8kg不应该10天完成，应该规划3-4个月
   - 例如：学会一门语言不应该1个月完成，应该规划6-12个月
   - 考虑用户的行动效率：如果用户行动力强，可以稍微加快节奏；如果用户容易疲惫，应该放慢节奏

3. **生成开始语**：根据你的人设和目标，生成一段鼓励用户完成目标的开始语（50-100字），要体现你对用户状态的理解

4. **拆分任务**：将目标拆分成多个小任务，任务可以分组
   - 根据分析的用户状态，从简单、容易完成的任务开始
   - 如果用户现在心情不好或能量低，第一个任务应该是非常简单的，让用户能够轻松完成，建立信心
   - 如果用户现在充满动力，可以从稍微有挑战性的任务开始
   - 任务密度要合理：不要天天换任务，每个任务应该持续一段时间（至少3-7天）

5. **生成结束语**：生成一段角色赞美用户成功完成目标的结束语（50-100字）

6. **生成奖励**：生成一个角色送给用户的奖励（可以是虚拟物品、称号、特权等，符合你的人设，50-100字）
   - 奖励描述：文字描述奖励的内容和意义
   - 奖励可视化：如果奖励是物品、徽章、卡片等，可以生成一个CSS/HTML代码来可视化渲染这个奖励（可选，如果奖励不适合可视化可以省略）

# 任务拆分规则

${goalTypeInstruction}
- 任务应该具体、可执行
- 任务可以分组，例如："不玩手机"这个任务可以拆分为：
  - 关闭小红书
  - 静音手机
  - 把手机放回床上
- 根据你的人设，你的拆分策略可能不是完全科学的，可能包含一些符合你人设的建议（比如先点杯奶茶）
- 任务数量建议在5-15个之间

# 输出格式（必须是严格的JSON）

{
  "startMessage": "开始语内容",
  "endMessage": "结束语内容",
  "reward": "角色送给用户的奖励内容（符合人设，50-100字）",
  "rewardVisualization": "奖励的可视化CSS/HTML代码（可选，如果奖励是物品、徽章、卡片等可以生成，格式：包含style标签的HTML代码，或者纯CSS代码，用于渲染奖励的外观。如果奖励不适合可视化，可以设为空字符串）",
  "taskGroups": [
    {
      "groupName": "任务组名称（可选，如果不需要分组可以为空字符串）",
      "tasks": [
        {
          "id": "task_1",
          "content": "任务内容",
          "completed": false,
          "completionMessage": "完成这个任务时的鼓励话语（20-40字）"${isLongTerm ? ',\n          "scheduledDate": "2024-01-15",\n          "scheduledTime": "09:00",\n          "scheduledEndTime": "19:00",\n          "isEvent": false,\n          "scheduledEndDate": "2024-01-20",\n          "isDaily": false,\n          "repeatDays": 0' : ''}
        }
      ]
    }
  ]
}

注意：
- 如果不需要分组，可以只有一个taskGroup，groupName为空字符串
- 每个任务必须有唯一的id
- 每个任务必须包含completionMessage字段，这是完成该任务时角色要说的话
- 必须包含reward字段，这是角色送给用户的奖励（符合你的人设，可以是虚拟物品、称号、特权等）
${isLongTerm ? `- **对于长线目标，每个任务必须包含以下字段（这是必须的，不能省略）：**
  * scheduledDate: 任务开始日期（YYYY-MM-DD格式，必须从今天${todayStr}开始往后分配，不能是过去的日期）
  * scheduledTime: 任务的时间（HH:mm格式，例如"09:00"、"14:30"，如果没有具体时间可以设为"09:00"，但不能为空）
  * isEvent: 是否为行程（true=行程，false=待办，必须明确指定）
  * scheduledEndDate: （可选）任务结束日期（YYYY-MM-DD格式），如果任务需要持续多天，使用此字段。例如：scheduledDate: "2024-01-01", scheduledEndDate: "2024-01-07" 表示1号到7号每天都有这个任务
  * isDaily: （可选）是否每天重复（布尔值），如果任务是每天重复的（例如"每天6点跑步"），设为true
  * repeatDays: （可选）重复天数（数字），如果isDaily为true，指定连续多少天。例如：isDaily: true, repeatDays: 7 表示连续7天每天都有这个任务

- **时间跨度要求**：
  * 必须根据目标类型和难度，规划合理的时间跨度（不要压缩时间！）
  * 如果目标是减肥8kg，总时间跨度应该是3-4个月，不要安排成1-2周
  * 如果目标是学会一门语言，总时间跨度应该是6-12个月，不要安排成1-2个月
  * 最后一个任务的日期应该反映这个合理的时间跨度

- **任务密度要求**：
  * 不要天天换任务！每个任务应该持续一段时间（至少3-7天）
  * **对于需要每天执行的任务（例如"每天6点跑步一小时"），使用isDaily和repeatDays字段，系统会自动为每一天创建月历项**
  * **对于需要持续多天的任务（例如"1号到5号每天记录饮食"），使用scheduledEndDate字段，系统会自动为每一天创建月历项**
  * 例如：安排"第1-7天：每天运动30分钟"应该使用isDaily: true, repeatDays: 7，而不是创建7个单独的任务
  * 任务之间应该有合理的间隔，不要过于密集

- **日期分配原则**：
  * 所有任务的日期必须按时间顺序排列，从近期到远期
  * 日期应该合理分配，考虑任务的依赖关系和执行周期
  * 考虑用户的行动效率、心情、能量等因素，从简单任务开始
  * 留出足够的适应和巩固时间

- **示例**：
  * 如果今天是${todayStr}，目标是"减肥8kg"（未指定时间）
  * 应该规划3-4个月的时间跨度（约90-120天）
  * 第一个任务可以是${todayStr}（开始记录饮食，使用isDaily: true, repeatDays: 14表示连续14天）
  * 最后一个任务应该在3-4个月后（约90-120天后）
  * 中间的任务应该合理分布，不要过于密集
  * 例如：第1-14天每天记录饮食（isDaily: true, repeatDays: 14），第15-28天每天运动30分钟（isDaily: true, repeatDays: 14）...` : ''}
- 直接输出JSON，不要添加任何其他文字`;

    const isGemini = proxyUrl === 'https://generativelanguage.googleapis.com/v1beta/models';
    const temperature = parseFloat(state.apiConfig.temperature) || 0.8;

    const messagesForApi = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请开始拆分任务。' },
    ];

    const requestData = isGemini
      ? window.toGeminiRequestData(
          model,
          apiKey,
          systemPrompt,
          [{ role: 'user', content: '请开始拆分任务。' }],
          true,
          temperature,
        )
      : {
          url: `${proxyUrl}/v1/chat/completions`,
          data: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: messagesForApi, temperature }),
          },
        };

    const response = await fetch(requestData.url, requestData.data);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const aiContent = isGemini
      ? result?.candidates?.[0]?.content?.parts?.[0]?.text
      : result?.choices?.[0]?.message?.content;

    if (!aiContent) {
      throw new Error('API返回了空内容');
    }

    // 解析JSON（去除可能的markdown代码块）
    let jsonContent = aiContent.replace(/^```json\s*|```$/g, '').trim();
    // 也尝试去除可能的markdown代码块标记
    jsonContent = jsonContent.replace(/^```\s*|```$/g, '').trim();
    
    let taskData;
    try {
      taskData = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('JSON解析失败:', parseError);
      console.error('原始内容:', aiContent);
      console.error('清理后的内容:', jsonContent);
      throw new Error(`AI返回的JSON格式不正确: ${parseError.message}`);
    }
    
    // 验证taskData结构
    if (!taskData || !taskData.taskGroups || !Array.isArray(taskData.taskGroups) || taskData.taskGroups.length === 0) {
      console.error('taskData结构不正确:', taskData);
      throw new Error('AI返回的任务数据格式不正确：缺少taskGroups或taskGroups为空');
    }

    // 验证长线目标的任务数据
    if (goalType === 'long') {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      console.log('验证长线目标任务数据，今天日期:', todayStr);
      console.log('任务数据:', JSON.stringify(taskData, null, 2));
      
      // 检查并修复任务数据
      let taskDate = new Date(today);
      for (const group of taskData.taskGroups) {
        for (const task of group.tasks) {
          // 如果没有scheduledDate，使用递增的日期
          if (!task.scheduledDate) {
            task.scheduledDate = `${taskDate.getFullYear()}-${String(taskDate.getMonth() + 1).padStart(2, '0')}-${String(taskDate.getDate()).padStart(2, '0')}`;
            console.log(`任务 ${task.id} 没有日期，自动分配: ${task.scheduledDate}`);
          } else {
            // 验证日期格式
            const dateMatch = task.scheduledDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!dateMatch) {
              console.warn(`任务 ${task.id} 日期格式不正确: ${task.scheduledDate}，使用今天`);
              task.scheduledDate = todayStr;
            }
          }
          // 如果没有scheduledTime，使用默认时间
          if (!task.scheduledTime) {
            task.scheduledTime = '09:00';
            console.log(`任务 ${task.id} 没有时间，使用默认: 09:00`);
          } else {
            // 验证时间格式
            const timeMatch = task.scheduledTime.match(/^(\d{2}):(\d{2})$/);
            if (!timeMatch) {
              console.warn(`任务 ${task.id} 时间格式不正确: ${task.scheduledTime}，使用默认`);
              task.scheduledTime = '09:00';
            }
          }
          // 如果没有isEvent，默认为待办
          if (task.isEvent === undefined) {
            task.isEvent = false;
            console.log(`任务 ${task.id} 没有isEvent，默认为待办`);
          }
          
          // 为下一个任务递增日期（如果任务没有指定日期）
          taskDate.setDate(taskDate.getDate() + 1);
          
          console.log(`任务 ${task.id} 最终数据:`, {
            scheduledDate: task.scheduledDate,
            scheduledTime: task.scheduledTime,
            isEvent: task.isEvent,
            content: task.content
          });
        }
      }
    }

    // 保存任务数据
    currentTaskData = {
      charId: charId,
      goal: goal,
      goalType: goalType,
      currentStatus: currentStatus,
      startMessage: taskData.startMessage,
      endMessage: taskData.endMessage,
      reward: taskData.reward || `${charName}送给你一个特别的奖励：恭喜你完成了目标！这是你应得的！`, // 奖励内容，如果没有则生成默认奖励
      rewardVisualization: taskData.rewardVisualization || '', // 奖励可视化代码
      taskGroups: taskData.taskGroups,
      completedTasks: new Set(),
      createdAt: Date.now(),
      calendarTaskIds: [], // 存储添加到月历的任务ID
    };
    
    // 如果没有reward字段，生成一个默认的
    if (!taskData.reward) {
      console.warn('AI没有生成reward字段，使用默认奖励');
    }

    // 如果是长线目标，将任务添加到月历
    if (goalType === 'long') {
      await addTasksToCalendar(taskData.taskGroups, charId);
    }

    // 保存进度
    saveTaskProgress();

    // 显示开始语在对话气泡中
    showDialogBubble(taskData.startMessage);

    // 渲染任务列表
    console.log('准备渲染任务列表，currentTaskData:', currentTaskData);
    console.log('taskGroups数量:', currentTaskData.taskGroups?.length);
    
    try {
      renderTaskList();
      console.log('任务列表渲染完成');
    } catch (renderError) {
      console.error('渲染任务列表失败:', renderError);
      console.error('错误堆栈:', renderError.stack);
      // 隐藏加载视图
      const loadingView = document.getElementById('task-splitter-loading-view');
      if (loadingView) {
        loadingView.style.display = 'none';
      }
      await showCustomAlert('错误', `渲染任务列表失败：${renderError.message}`);
      await renderTaskSplitterInitialView(chat);
      return;
    }
    
    // 确保按钮事件已绑定
    ensureTaskSplitterButtonsBound(chat);

  } catch (error) {
    console.error('生成任务拆解失败:', error);
    console.error('错误堆栈:', error.stack);
    
    // 隐藏加载视图
    const loadingView = document.getElementById('task-splitter-loading-view');
    if (loadingView) {
      loadingView.style.display = 'none';
    }
    
    // 显示错误信息
    await showCustomAlert('错误', `生成任务拆解失败：${error.message}`);
    
    // 返回初始界面
    await renderTaskSplitterInitialView(chat);
  }
}

/**
 * 渲染任务列表
 */
/**
 * 显示对话气泡
 */
function showDialogBubble(message) {
  const bubble = document.getElementById('task-splitter-dialog-bubble');
  const content = document.getElementById('task-splitter-dialog-content');
  if (bubble && content) {
    content.textContent = message;
    bubble.style.display = 'block';
  }
}

/**
 * 隐藏对话气泡
 */
function hideDialogBubble() {
  const bubble = document.getElementById('task-splitter-dialog-bubble');
  if (bubble) {
    bubble.style.display = 'none';
  }
}

function renderTaskList() {
  const loadingView = document.getElementById('task-splitter-loading-view');
  const tasksView = document.getElementById('task-splitter-tasks-view');
  const tasksContainer = document.getElementById('task-splitter-tasks-container');
  const helpBtn = document.getElementById('task-splitter-help-btn');

  if (!tasksView || !tasksContainer) {
    console.error('找不到任务视图元素');
    return;
  }
  
  // 检查currentTaskData是否存在
  if (!currentTaskData) {
    console.error('currentTaskData为空，无法渲染任务列表');
    if (loadingView) loadingView.style.display = 'none';
    return;
  }
  
  // 检查taskGroups是否存在
  if (!currentTaskData.taskGroups || currentTaskData.taskGroups.length === 0) {
    console.error('taskGroups为空，无法渲染任务列表');
    if (loadingView) loadingView.style.display = 'none';
    return;
  }

  // 隐藏加载，显示任务列表
  if (loadingView) {
    loadingView.style.display = 'none';
  }
  
  // 确保任务视图显示
  if (tasksView) {
    tasksView.style.display = 'block';
    tasksView.style.visibility = 'visible';
    tasksView.style.opacity = '1';
  }
  
  // 确保任务容器显示
  if (tasksContainer) {
    tasksContainer.style.display = 'block';
    tasksContainer.style.visibility = 'visible';
    tasksContainer.style.opacity = '1';
  }
  
  if (helpBtn) {
    helpBtn.style.display = 'block';
  }
  
  // 显示取消任务和切换角色按钮
  const cancelBtn = document.getElementById('task-splitter-cancel-task-btn');
  const switchCharBtn = document.getElementById('task-splitter-switch-char-btn');
  if (cancelBtn) {
    cancelBtn.style.display = 'block';
    cancelBtn.style.pointerEvents = 'auto';
    cancelBtn.style.zIndex = '1000';
  }
  if (switchCharBtn) {
    switchCharBtn.style.display = 'block';
    switchCharBtn.style.pointerEvents = 'auto';
    switchCharBtn.style.zIndex = '1000';
  }
  
  // 确保按钮事件已绑定
  const chat = state.chats[activeTaskSplitterCharId];
  if (chat) {
    ensureTaskSplitterButtonsBound(chat);
  }

  // 清空任务容器
  tasksContainer.innerHTML = '';

  // 渲染任务分组
  // 找到当前应该显示的分组（第一个有未完成任务的分组）
  let currentGroupIndex = 0;
  for (let i = 0; i < currentTaskData.taskGroups.length; i++) {
    const group = currentTaskData.taskGroups[i];
    const hasUncompletedTask = group.tasks.some(task => 
      !currentTaskData.completedTasks.has(task.id)
    );
    if (hasUncompletedTask) {
      currentGroupIndex = i;
      break;
    }
  }
  // 如果所有任务都完成了，显示最后一个分组
  if (currentGroupIndex === 0 && currentTaskData.taskGroups.length > 0) {
    const allCompleted = currentTaskData.taskGroups.every(group =>
      group.tasks.every(task => currentTaskData.completedTasks.has(task.id))
    );
    if (allCompleted) {
      currentGroupIndex = currentTaskData.taskGroups.length - 1;
    }
  }
  
  console.log('开始渲染任务分组，共', currentTaskData.taskGroups.length, '个分组，当前显示分组:', currentGroupIndex);
  
  try {
    currentTaskData.taskGroups.forEach((group, groupIndex) => {
    // 检查分组是否有任务
    if (!group.tasks || group.tasks.length === 0) {
      console.warn(`分组 ${groupIndex} 没有任务，跳过渲染`);
      return;
    }
    
    const groupDiv = document.createElement('div');
    groupDiv.className = 'task-group';
    groupDiv.dataset.groupIndex = groupIndex;
    groupDiv.style.cssText = `
      margin-bottom: 30px;
      ${groupIndex !== currentGroupIndex ? 'display: none;' : 'display: block;'}
    `;

    // 如果有组名，显示组名
    if (group.groupName) {
      const groupTitle = document.createElement('h3');
      groupTitle.textContent = group.groupName;
      groupTitle.style.cssText = `
        font-size: 18px;
        color: #333;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid #4CAF50;
      `;
      groupDiv.appendChild(groupTitle);
    }

    // 任务列表
    const tasksList = document.createElement('div');
    tasksList.className = 'tasks-list';
    group.tasks.forEach((task, taskIndex) => {
      const taskItem = document.createElement('div');
      taskItem.className = 'task-item';
      taskItem.dataset.taskId = task.id;
      taskItem.style.cssText = `
        display: flex;
        align-items: center;
        padding: 15px;
        margin-bottom: 10px;
        background: #f5f5f5;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s;
      `;

      const isCompleted = currentTaskData.completedTasks.has(task.id);
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `task-checkbox-${task.id}`;
      checkbox.checked = isCompleted;
      checkbox.style.cssText = `
        width: 20px;
        height: 20px;
        margin-right: 15px;
        cursor: pointer;
      `;

      const taskLabel = document.createElement('label');
      taskLabel.htmlFor = `task-checkbox-${task.id}`;
      
      // 如果是长线目标且有日期信息，显示日期和时间（优化格式）
      let taskContent = task.content;
      if (currentTaskData.goalType === 'long' && task.scheduledDate) {
        const startDateObj = new Date(task.scheduledDate);
        const startMonth = startDateObj.getMonth() + 1;
        const startDay = startDateObj.getDate();
        const timeStr = task.scheduledTime || '';
        
        let dateTimeStr = '';
        
        // 检查是否有结束日期（日期范围）
        if (task.scheduledEndDate) {
          const endDateObj = new Date(task.scheduledEndDate);
          const endMonth = endDateObj.getMonth() + 1;
          const endDay = endDateObj.getDate();
          
          // 如果是同一个月
          if (startMonth === endMonth) {
            dateTimeStr = `${startMonth}月${startDay}日至${endDay}日`;
          } else {
            dateTimeStr = `${startMonth}月${startDay}日至${endMonth}月${endDay}日`;
          }
        }
        // 检查是否是每天重复任务
        else if (task.isDaily && task.repeatDays) {
          const endDateObj = new Date(startDateObj);
          endDateObj.setDate(startDateObj.getDate() + task.repeatDays - 1);
          const endMonth = endDateObj.getMonth() + 1;
          const endDay = endDateObj.getDate();
          
          if (startMonth === endMonth) {
            dateTimeStr = `${startMonth}月${startDay}日至${endDay}日`;
          } else {
            dateTimeStr = `${startMonth}月${startDay}日至${endMonth}月${endDay}日`;
          }
        }
        // 检查是否是每天重复但没有指定天数（默认30天）
        else if (task.isDaily) {
          const endDateObj = new Date(startDateObj);
          endDateObj.setDate(startDateObj.getDate() + 29); // 30天包括起始日
          const endMonth = endDateObj.getMonth() + 1;
          const endDay = endDateObj.getDate();
          
          if (startMonth === endMonth) {
            dateTimeStr = `${startMonth}月${startDay}日至${endDay}日`;
          } else {
            dateTimeStr = `${startMonth}月${startDay}日至${endMonth}月${endDay}日`;
          }
        }
        // 单日任务
        else {
          dateTimeStr = `${startMonth}月${startDay}日`;
        }
        
        // 添加时间信息
        if (timeStr) {
          // 检查是否有结束时间
          if (task.scheduledEndTime) {
            dateTimeStr += `，${timeStr}至${task.scheduledEndTime}`;
          } else {
            dateTimeStr += `，${timeStr}`;
          }
        }
        
        taskContent = `[${dateTimeStr}] ${task.content}`;
      }
      
      taskLabel.textContent = taskContent;
      taskLabel.style.cssText = `
        flex: 1;
        font-size: 16px;
        color: #333;
        cursor: pointer;
        ${isCompleted ? 'text-decoration: line-through; color: #999;' : ''}
      `;
      
      if (isCompleted) {
        taskItem.style.opacity = '0.7';
      }

      taskItem.appendChild(checkbox);
      taskItem.appendChild(taskLabel);

      // 点击事件
      checkbox.onchange = async () => {
        await handleTaskCompletion(task.id, checkbox.checked);
      };

      taskItem.onclick = (e) => {
        if (e.target !== checkbox && e.target !== taskLabel) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      };

      tasksList.appendChild(taskItem);
    });

    groupDiv.appendChild(tasksList);
    tasksContainer.appendChild(groupDiv);
    console.log(`分组 ${groupIndex} 渲染完成，包含 ${group.tasks.length} 个任务`);
    });
  } catch (renderError) {
    console.error('渲染任务分组时出错:', renderError);
    console.error('错误堆栈:', renderError.stack);
    // 显示错误信息
    tasksContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #f44336;">
        <p style="font-size: 18px; margin-bottom: 10px;">渲染任务列表时出错</p>
        <p style="font-size: 14px; color: #666;">${renderError.message}</p>
      </div>
    `;
    throw renderError; // 重新抛出错误，让上层处理
  }

  // 确保至少有一个分组被显示
  const renderedGroups = tasksContainer.querySelectorAll('.task-group');
  if (renderedGroups.length === 0) {
    console.error('没有渲染任何任务分组！');
    tasksContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #f44336;">
        <p style="font-size: 18px; margin-bottom: 10px;">渲染任务列表时出错</p>
        <p style="font-size: 14px; color: #666;">没有找到任何任务分组</p>
      </div>
    `;
    return;
  }
  
  // 滚动到当前显示的分组
  const currentGroupDiv = document.querySelector(`[data-group-index="${currentGroupIndex}"]`);
  if (currentGroupDiv) {
    setTimeout(() => {
      currentGroupDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  } else {
    // 如果没有找到当前分组，显示第一个分组
    const firstGroup = renderedGroups[0];
    if (firstGroup) {
      firstGroup.style.display = 'block';
      setTimeout(() => {
        firstGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      // 如果没有找到当前分组，滚动到顶部
      const contentArea = document.getElementById('task-splitter-content-area');
      if (contentArea) {
        contentArea.scrollTop = 0;
      }
    }
  }
  
  console.log('所有任务分组渲染完成，当前显示分组:', currentGroupIndex, '，共渲染', renderedGroups.length, '个分组');
}

/**
 * 处理任务完成
 */
async function handleTaskCompletion(taskId, completed) {
  if (completed) {
    currentTaskData.completedTasks.add(taskId);
    
    // 找到对应的任务，显示预生成的完成消息
    for (const group of currentTaskData.taskGroups) {
      const task = group.tasks.find(t => t.id === taskId);
      if (task && task.completionMessage) {
        showDialogBubble(task.completionMessage);
        break;
      }
    }
    
    // 同步到月历（如果不是从月历同步过来的）
    if (!isSyncingFromCalendar) {
      await syncTaskSplitterCompletionToCalendar(taskId, true);
    }
  } else {
    currentTaskData.completedTasks.delete(taskId);
    // 同步到月历（如果不是从月历同步过来的）
    if (!isSyncingFromCalendar) {
      await syncTaskSplitterCompletionToCalendar(taskId, false);
    }
  }
  
  // 保存进度
  saveTaskProgress();

  // 更新UI
  const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!taskItem) return;
  
  const taskLabel = taskItem.querySelector('label');
  if (completed) {
    taskLabel.style.textDecoration = 'line-through';
    taskLabel.style.color = '#999';
    taskItem.style.opacity = '0.7';
  } else {
    taskLabel.style.textDecoration = 'none';
    taskLabel.style.color = '#333';
    taskItem.style.opacity = '1';
  }

  // 检查当前分组是否全部完成
  const groupDiv = taskItem.closest('.task-group');
  const groupIndex = parseInt(groupDiv.dataset.groupIndex);
  const group = currentTaskData.taskGroups[groupIndex];
  const allCompleted = group.tasks.every(task => 
    currentTaskData.completedTasks.has(task.id)
  );

  if (allCompleted && groupIndex < currentTaskData.taskGroups.length - 1) {
    // 当前分组完成，显示下一个分组（翻页动画）
    await showNextTaskGroup(groupIndex);
  } else if (completed) {
    // 任务完成时，自动滚动到下一个未完成的任务（手机端优化）
    setTimeout(() => {
      const allTasks = groupDiv.querySelectorAll('.task-item');
      let nextTask = null;
      
      // 找到下一个未完成的任务
      for (let i = 0; i < allTasks.length; i++) {
        const item = allTasks[i];
        const itemTaskId = item.dataset.taskId;
        if (!currentTaskData.completedTasks.has(itemTaskId)) {
          nextTask = item;
          break;
        }
      }
      
      // 如果当前分组没有未完成任务，查找下一个分组
      if (!nextTask && groupIndex < currentTaskData.taskGroups.length - 1) {
        const nextGroup = document.querySelector(`[data-group-index="${groupIndex + 1}"]`);
        if (nextGroup) {
          const nextGroupTasks = nextGroup.querySelectorAll('.task-item');
          if (nextGroupTasks.length > 0) {
            nextTask = nextGroupTasks[0];
          }
        }
      }
      
      // 滚动到下一个任务
      if (nextTask) {
        nextTask.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
      } else {
        // 如果没有下一个任务，滚动到当前任务项（确保它可见）
        taskItem.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
      }
    }, 300); // 延迟300ms，等待UI更新完成
  }

  // 检查所有任务是否完成
  const allTasksCompleted = currentTaskData.taskGroups.every(group =>
    group.tasks.every(task => currentTaskData.completedTasks.has(task.id))
  );

  if (allTasksCompleted) {
    // 所有任务完成，显示完成界面
    console.log('所有任务已完成，准备显示完成界面');
    console.log('currentTaskData:', currentTaskData);
    // 确保currentTaskData存在
    if (!currentTaskData) {
      console.error('currentTaskData为空，无法显示完成界面');
      return;
    }
    await showTaskCompletion();
  }
}

/**
 * 显示下一个任务分组（翻页动画）
 */
async function showNextTaskGroup(currentGroupIndex) {
  const currentGroup = document.querySelector(`[data-group-index="${currentGroupIndex}"]`);
  const nextGroup = document.querySelector(`[data-group-index="${currentGroupIndex + 1}"]`);
  
  if (!nextGroup) return;

  // 翻页动画
  currentGroup.style.transition = 'transform 0.5s, opacity 0.5s';
  currentGroup.style.transform = 'translateX(-100%)';
  currentGroup.style.opacity = '0';

  await new Promise(resolve => setTimeout(resolve, 500));

  currentGroup.style.display = 'none';
  nextGroup.style.display = 'block';
  nextGroup.style.opacity = '0';
  nextGroup.style.transform = 'translateX(100%)';
  
  await new Promise(resolve => setTimeout(resolve, 50));
  
  nextGroup.style.transition = 'transform 0.5s, opacity 0.5s';
  nextGroup.style.transform = 'translateX(0)';
  nextGroup.style.opacity = '1';

  // 滚动到新分组
  nextGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 显示任务完成界面
 */
async function showTaskCompletion() {
  if (!currentTaskData) {
    console.error('currentTaskData为空，无法显示完成界面');
    return;
  }
  
  const tasksView = document.getElementById('task-splitter-tasks-view');
  const completionView = document.getElementById('task-splitter-completion-view');
  let rewardEl = document.getElementById('task-splitter-reward-message');
  
  // 如果reward元素不存在，尝试使用旧的end-message元素
  if (!rewardEl) {
    rewardEl = document.getElementById('task-splitter-end-message');
  }
  
  const helpBtn = document.getElementById('task-splitter-help-btn');
  const newGoalBtn = document.getElementById('task-splitter-new-goal-btn');

  // 显示结束语在对话气泡中
  if (currentTaskData.endMessage) {
    showDialogBubble(currentTaskData.endMessage);
  }

  // 隐藏任务列表（翻页效果）
  // 注意：不要隐藏整个tasksView，因为completionView在里面
  const tasksContainer = document.getElementById('task-splitter-tasks-container');
  if (tasksContainer) {
    tasksContainer.style.transition = 'transform 0.5s, opacity 0.5s';
    tasksContainer.style.transform = 'translateX(-100%)';
    tasksContainer.style.opacity = '0';
    
    // 等待动画完成后再隐藏
    setTimeout(() => {
      tasksContainer.style.display = 'none';
    }, 500);
  }
  
  // 确保tasksView保持显示，因为completionView在里面
  if (tasksView) {
    tasksView.style.display = 'block';
  }

  // 显示奖励：先显示可视化，再显示文字描述
  const rewardText = currentTaskData.reward || `${state.chats[activeTaskSplitterCharId]?.name || '角色'}送给你一个特别的奖励：恭喜你完成了目标！这是你应得的！`;
  const rewardVisualization = currentTaskData.rewardVisualization || '';
  
  const rewardContainer = document.getElementById('task-splitter-reward-container');
  const rewardVisualizationEl = document.getElementById('task-splitter-reward-visualization');
  
  // 设置奖励可视化（优先显示）
  if (rewardVisualizationEl) {
    if (rewardVisualization) {
      // 尝试渲染可视化代码
      try {
        // 如果包含style标签，提取内容
        let visualizationHTML = rewardVisualization;
        if (rewardVisualization.includes('<style>')) {
          const styleMatch = rewardVisualization.match(/<style>([\s\S]*?)<\/style>/);
          if (styleMatch) {
            const styleContent = styleMatch[1];
            const styleEl = document.createElement('style');
            styleEl.textContent = styleContent;
            document.head.appendChild(styleEl);
          }
          // 提取HTML部分
          visualizationHTML = rewardVisualization.replace(/<style>[\s\S]*?<\/style>/g, '').trim();
        }
        // 确保可视化内容居中 - 包装在一个居中的容器中
        // 如果可视化HTML本身已经有样式，我们需要确保它被包裹在一个居中的容器中
        const wrappedHTML = visualizationHTML.trim();
        // 检查是否已经有外层div，如果没有则添加
        let finalHTML = wrappedHTML;
        if (!wrappedHTML.startsWith('<div') || !wrappedHTML.includes('display: flex') && !wrappedHTML.includes('margin: 0 auto')) {
          finalHTML = `<div style="display: flex; justify-content: center; align-items: center; width: 100%; margin: 0 auto;">${wrappedHTML}</div>`;
        }
        rewardVisualizationEl.innerHTML = finalHTML;
        rewardVisualizationEl.style.display = 'flex';
        rewardVisualizationEl.style.justifyContent = 'center';
        rewardVisualizationEl.style.alignItems = 'center';
        rewardVisualizationEl.style.margin = '0 auto';
        rewardVisualizationEl.style.textAlign = 'center';
      } catch (error) {
        console.error('渲染奖励可视化失败:', error);
        rewardVisualizationEl.innerHTML = '<div style="text-align: center; padding: 40px; font-size: 48px;">🎁</div>';
        rewardVisualizationEl.style.display = 'flex';
        rewardVisualizationEl.style.justifyContent = 'center';
        rewardVisualizationEl.style.alignItems = 'center';
        rewardVisualizationEl.style.margin = '0 auto';
      }
    } else {
      // 如果没有可视化代码，显示默认图标
      rewardVisualizationEl.innerHTML = '<div style="text-align: center; padding: 40px; font-size: 48px;">🎁</div>';
      rewardVisualizationEl.style.display = 'flex';
      rewardVisualizationEl.style.justifyContent = 'center';
      rewardVisualizationEl.style.alignItems = 'center';
      rewardVisualizationEl.style.margin = '0 auto';
    }
  }
  
  // 显示奖励文字描述（保留在下方）
  if (rewardEl) {
    // 转义HTML特殊字符
    const safeRewardText = rewardText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
    
    rewardEl.innerHTML = safeRewardText;
    rewardEl.style.display = 'block';
    rewardEl.style.visibility = 'visible';
    rewardEl.style.opacity = '1';
  } else {
    console.error('找不到task-splitter-reward-message元素，尝试创建');
  }
  
  // 移除点击切换功能（不再需要，因为要同时显示）
  if (rewardContainer) {
    rewardContainer.style.cursor = 'default';
    rewardContainer.onclick = null;
  }
  
  // 确保完成界面元素存在
  if (!completionView) {
    console.error('找不到task-splitter-completion-view元素，无法显示完成界面');
    return;
  }
  
  // 显示完成界面（翻页效果）
  // completionView在tasksView内部，所以只需要确保tasksView显示
  if (tasksView) {
    tasksView.style.display = 'block';
  }
  
  if (completionView) {
    completionView.style.display = 'flex';
    completionView.style.visibility = 'visible';
    completionView.style.opacity = '0';
    completionView.style.transform = 'translateX(100%)';
    completionView.style.transition = 'transform 0.5s, opacity 0.5s';
    completionView.style.position = 'relative';
    completionView.style.zIndex = '10';
    completionView.style.width = '100%';
    completionView.style.minHeight = '200px';
    // 上移界面，减少padding
    completionView.style.paddingTop = '20px';
    completionView.style.paddingBottom = '20px';
    // 确保内容居中
    completionView.style.flexDirection = 'column';
    completionView.style.justifyContent = 'center';
    completionView.style.alignItems = 'center';
  }
  
  // 确保按钮显示
  if (newGoalBtn) {
    newGoalBtn.style.display = 'block';
    newGoalBtn.style.visibility = 'visible';
    newGoalBtn.style.opacity = '1';
  }
  
  // 延迟显示，实现翻页效果
  setTimeout(() => {
    if (completionView) {
      completionView.style.transform = 'translateX(0)';
      completionView.style.opacity = '1';
    }
    if (rewardEl) {
      rewardEl.style.opacity = '1';
    }
  }, 500);
  
  // 隐藏帮助按钮
  if (helpBtn) {
    helpBtn.style.display = 'none';
  }
  
  // 隐藏取消任务和切换角色按钮
  const cancelBtn = document.getElementById('task-splitter-cancel-task-btn');
  const switchCharBtn = document.getElementById('task-splitter-switch-char-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (switchCharBtn) switchCharBtn.style.display = 'none';

  // 修改"新增目标"按钮为"完成"按钮
  if (newGoalBtn) {
    newGoalBtn.textContent = '完成';
    newGoalBtn.style.display = 'block';
    newGoalBtn.style.visibility = 'visible';
    newGoalBtn.style.pointerEvents = 'auto';
    newGoalBtn.style.opacity = '1';
    
    // 移除旧的事件监听器，添加新的事件
    const newBtn = newGoalBtn.cloneNode(true);
    newGoalBtn.parentNode.replaceChild(newBtn, newGoalBtn);
    newBtn.onclick = async () => {
      // 发送奖励消息到聊天
      await sendTaskRewardToChat();
      
      // 清除保存的进度（因为已经完成了）
      clearTaskProgress(activeTaskSplitterCharId);
      currentTaskData = null;
      hideDialogBubble();
      showScreen('home-screen');
    };
  } else {
    console.error('找不到task-splitter-new-goal-btn元素');
  }

  // 保存记录
  await saveTaskRecord();
  
  // 注意：不要立即清除进度，让用户可以看到完成界面
  // 只有在用户点击"完成"按钮或返回首页时才清除

  // 滚动到完成界面
  setTimeout(() => {
    if (completionView) {
      completionView.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 1000);
  
  console.log('完成界面显示完成，reward:', rewardText);
  console.log('completionView:', completionView);
  console.log('rewardEl:', rewardEl);
  console.log('newGoalBtn:', newGoalBtn);
}

/**
 * 保存任务记录
 */
async function saveTaskRecord() {
  if (!currentTaskData) return;

  try {
    // 获取保存的记录列表
    let records = JSON.parse(localStorage.getItem('task-splitter-records') || '[]');
    
    // 添加新记录
    const record = {
      id: Date.now().toString(),
      charId: currentTaskData.charId,
      charName: state.chats[currentTaskData.charId]?.name || '未知',
      goal: currentTaskData.goal,
      currentStatus: currentTaskData.currentStatus,
      startMessage: currentTaskData.startMessage,
      endMessage: currentTaskData.endMessage,
      reward: currentTaskData.reward || '恭喜你完成了目标！', // 奖励内容
      rewardVisualization: currentTaskData.rewardVisualization || '', // 奖励可视化代码
      taskGroups: currentTaskData.taskGroups,
      completedTasks: Array.from(currentTaskData.completedTasks),
      createdAt: currentTaskData.createdAt,
      completedAt: Date.now(),
      calendarTaskIds: currentTaskData.calendarTaskIds || [], // 保存月历任务ID，用于删除
    };
    
    records.unshift(record); // 最新的在前面
    localStorage.setItem('task-splitter-records', JSON.stringify(records));
  } catch (error) {
    console.error('保存任务记录失败:', error);
  }
}

/**
 * 处理"遇到困难"按钮
 */
async function handleTaskSplitterHelp() {
  const chat = state.chats[activeTaskSplitterCharId];
  if (!chat || !currentTaskData) return;

  const completedCount = currentTaskData.completedTasks.size;
  const totalTasks = currentTaskData.taskGroups.reduce((sum, group) => sum + group.tasks.length, 0);
  const currentGroup = currentTaskData.taskGroups.find(group =>
    group.tasks.some(task => !currentTaskData.completedTasks.has(task.id))
  );
  const currentTask = currentGroup?.tasks.find(task => !currentTaskData.completedTasks.has(task.id));

  try {
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      showDialogBubble('API未配置，无法帮助你...');
      return;
    }

    // 在气泡中显示"思考中..."
    showDialogBubble('思考中...');

    const charName = chat.name;
    const charPersona = chat.settings.aiPersona || '一个友善的助手。';
    const userNickname = chat.settings.myNickname || state.qzoneSettings.nickname || '你';

    const systemPrompt = `你是角色"${charName}"，你的人设是："${charPersona}"

用户正在完成目标："${currentTaskData.goal}"
当前进度：已完成 ${completedCount}/${totalTasks} 个任务
${currentTask ? `当前任务：${currentTask.content}` : '所有任务都已完成'}

用户遇到了困难，需要你的帮助、鼓励或陪伴。请根据你的人设，给出一段鼓励或建议（50-100字）。直接输出文字，不要添加引号或其他格式。`;

    const isGemini = proxyUrl === 'https://generativelanguage.googleapis.com/v1beta/models';
    const temperature = parseFloat(state.apiConfig.temperature) || 0.8;

    const messagesForApi = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '我遇到困难了，需要帮助。' },
    ];

    const requestData = isGemini
      ? window.toGeminiRequestData(
          model,
          apiKey,
          systemPrompt,
          [{ role: 'user', content: '我遇到困难了，需要帮助。' }],
          true,
          temperature,
        )
      : {
          url: `${proxyUrl}/v1/chat/completions`,
          data: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: messagesForApi, temperature }),
          },
        };

    const response = await fetch(requestData.url, requestData.data);
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }

    const result = await response.json();
    const aiContent = isGemini
      ? result?.candidates?.[0]?.content?.parts?.[0]?.text
      : result?.choices?.[0]?.message?.content;

    if (aiContent) {
      // 在气泡中显示回应
      showDialogBubble(aiContent.trim());
    }
  } catch (error) {
    console.error('生成帮助回应失败:', error);
    showDialogBubble(`抱歉，我遇到了一些问题：${error.message}`);
  }
}

/**
 * 设置背景图片
 */
function setupImageSettingsModal() {
  const modal = document.getElementById('task-splitter-image-settings-modal');
  const cancelBtn = document.getElementById('task-splitter-image-cancel-btn');
  const saveBtn = document.getElementById('task-splitter-image-save-btn');
  const uploadInput = document.getElementById('task-splitter-image-upload');
  const urlInput = document.getElementById('task-splitter-image-url-input');

  cancelBtn.onclick = () => {
    modal.classList.remove('visible');
  };

  saveBtn.onclick = () => {
    const url = urlInput.value.trim();
    if (url) {
      saveTaskSplitterBackground(url);
      modal.classList.remove('visible');
    }
  };

  uploadInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        saveTaskSplitterBackground(dataUrl);
        modal.classList.remove('visible');
      };
      reader.readAsDataURL(file);
    }
  };
}

/**
 * 显示背景图片设置
 */
function showTaskSplitterImageSettings() {
  const modal = document.getElementById('task-splitter-image-settings-modal');
  modal.classList.add('visible');
  
  // 加载当前设置
  const savedBg = localStorage.getItem('task-splitter-background');
  if (savedBg) {
    document.getElementById('task-splitter-image-url-input').value = savedBg;
  }
}

/**
 * 保存背景图片
 */
function saveTaskSplitterBackground(imageUrl) {
  localStorage.setItem('task-splitter-background', imageUrl);
  loadTaskSplitterBackground();
}

/**
 * 加载背景图片
 */
function loadTaskSplitterBackground() {
  const imageArea = document.getElementById('task-splitter-image-area');
  const savedBg = localStorage.getItem('task-splitter-background');
  if (savedBg) {
    imageArea.style.backgroundImage = `url(${savedBg})`;
  } else {
    imageArea.style.backgroundImage = 'none';
  }
}

/**
 * 打开历史记录
 */
function openTaskSplitterHistory() {
  const modal = document.getElementById('task-splitter-history-modal');
  const listEl = document.getElementById('task-splitter-history-list');
  
  // 获取保存的记录
  const records = JSON.parse(localStorage.getItem('task-splitter-records') || '[]');
  
  listEl.innerHTML = '';
  
  if (records.length === 0) {
    listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 40px;">暂无完成记录</p>';
  } else {
    records.forEach((record, index) => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 15px;
        margin-bottom: 10px;
        background: #f5f5f5;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s;
        position: relative;
      `;
      
      const completedDate = new Date(record.completedAt).toLocaleString();
      const createdDate = new Date(record.createdAt).toLocaleString();
      const completedCount = record.completedTasks.length;
      const totalTasks = record.taskGroups.reduce((sum, group) => sum + group.tasks.length, 0);
      const rewardVisualization = record.rewardVisualization || '';
      const rewardText = record.reward || '恭喜你完成了目标！';
      
      // 创建奖励可视化容器
      let rewardVisualizationHTML = '';
      if (rewardVisualization) {
        try {
          let visualizationHTML = rewardVisualization;
          if (rewardVisualization.includes('<style>')) {
            const styleMatch = rewardVisualization.match(/<style>([\s\S]*?)<\/style>/);
            if (styleMatch) {
              const styleContent = styleMatch[1];
              const styleId = `reward-style-${record.id}`;
              // 检查样式是否已存在
              if (!document.getElementById(styleId)) {
                const styleEl = document.createElement('style');
                styleEl.id = styleId;
                styleEl.textContent = styleContent;
                document.head.appendChild(styleEl);
              }
            }
            visualizationHTML = rewardVisualization.replace(/<style>[\s\S]*?<\/style>/g, '').trim();
          }
          rewardVisualizationHTML = `<div style="margin: 10px 0; padding: 15px; background: white; border-radius: 8px; min-height: 100px; display: flex; justify-content: center; align-items: center;">${visualizationHTML}</div>`;
        } catch (error) {
          console.error('渲染奖励可视化失败:', error);
          rewardVisualizationHTML = `<div style="margin: 10px 0; padding: 15px; background: white; border-radius: 8px; text-align: center; font-size: 48px; display: flex; justify-content: center; align-items: center;">🎁</div>`;
        }
      } else {
        rewardVisualizationHTML = `<div style="margin: 10px 0; padding: 15px; background: white; border-radius: 8px; text-align: center; font-size: 48px; display: flex; justify-content: center; align-items: center;">🎁</div>`;
      }
      
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
          <div style="flex: 1;">
            <div style="font-weight: bold; font-size: 16px; color: #333; margin-bottom: 5px;">
              ${record.goal}
            </div>
            <div style="font-size: 12px; color: #999;">
              角色：${record.charName} | 完成 ${completedCount}/${totalTasks} 个任务
            </div>
          </div>
        </div>
        <div style="display: flex; justify-content: center; align-items: center; margin: 10px 0;">
          ${rewardVisualizationHTML}
        </div>
        <div style="font-size: 14px; color: #333; margin-top: 10px; line-height: 1.6; padding: 10px; background: white; border-radius: 8px; text-align: center;">
          ${rewardText}
        </div>
        <div style="font-size: 12px; color: #666; margin-top: 8px;">
          <div>开始：${createdDate}</div>
          <div>完成：${completedDate}</div>
        </div>
        <div style="position: absolute; top: 10px; right: 10px; font-size: 12px; color: #999; opacity: 0.7;">
          长按删除
        </div>
      `;
      
      // 点击打开详情
      item.onclick = () => {
        showTaskSplitterHistoryDetail(record);
      };
      
      // 长按删除
      let longPressTimer = null;
      item.addEventListener('touchstart', (e) => {
        longPressTimer = setTimeout(() => {
          e.preventDefault();
          deleteTaskRecord(record, index);
        }, 800); // 800ms长按
      });
      item.addEventListener('touchend', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      });
      item.addEventListener('touchmove', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      });
      
      // 鼠标长按（桌面端）
      item.addEventListener('mousedown', (e) => {
        longPressTimer = setTimeout(() => {
          e.preventDefault();
          deleteTaskRecord(record, index);
        }, 800);
      });
      item.addEventListener('mouseup', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      });
      item.addEventListener('mouseleave', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      });
      
      listEl.appendChild(item);
    });
  }
  
  // 绑定关闭按钮
  const closeBtn = document.getElementById('task-splitter-history-close-btn');
  closeBtn.onclick = () => {
    modal.classList.remove('visible');
  };
  
  modal.classList.add('visible');
}

/**
 * 发送任务奖励到聊天
 */
async function sendTaskRewardToChat() {
  if (!currentTaskData || !activeTaskSplitterCharId) return;
  
  const chat = state.chats[activeTaskSplitterCharId];
  if (!chat) return;
  
  const rewardText = currentTaskData.reward || '恭喜你完成了目标！';
  const rewardVisualization = currentTaskData.rewardVisualization || '';
  const goal = currentTaskData.goal;
  
  // 创建奖励消息（对用户可见）
  const rewardMessage = {
    role: 'user', // 由用户触发，但显示为角色发送
    type: 'task_reward',
    timestamp: Date.now(),
    content: rewardText,
    payload: {
      goal: goal,
      rewardText: rewardText,
      rewardVisualization: rewardVisualization,
      charId: activeTaskSplitterCharId,
      charName: chat.name,
    },
  };
  
  chat.history.push(rewardMessage);
  
  // 创建给AI看的隐藏指令
  const hiddenMessage = {
    role: 'system',
    content: `[系统指令：用户刚刚完成了你设定的目标"${goal}"。你送给用户的奖励是：${rewardText}。请根据这个奖励和用户完成的事情，以你的角色人设，主动开启一段新的对话，表达你对用户完成目标的祝贺和鼓励。]`,
    timestamp: Date.now() + 1,
    isHidden: true,
  };
  chat.history.push(hiddenMessage);
  
  // 保存到数据库
  await db.chats.put(chat);
  
  // 打开聊天界面并触发AI响应
  if (typeof openChat === 'function') {
    openChat(activeTaskSplitterCharId);
  }
  if (typeof triggerAiResponse === 'function') {
    triggerAiResponse();
  }
}

/**
 * 显示历史记录详情
 */
async function showTaskSplitterHistoryDetail(record) {
  // 创建一个详情模态框
  let detailModal = document.getElementById('task-splitter-history-detail-modal');
  if (!detailModal) {
    detailModal = document.createElement('div');
    detailModal.id = 'task-splitter-history-detail-modal';
    detailModal.className = 'modal';
    detailModal.innerHTML = `
      <div class="modal-content" style="width: 90%; max-width: 600px; max-height: 80%;">
        <div class="modal-header">
          <span>目标详情</span>
          <span id="task-splitter-history-detail-close-btn" style="cursor: pointer; font-size: 24px;">×</span>
        </div>
        <div class="modal-body" id="task-splitter-history-detail-content" style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 100px);">
        </div>
      </div>
    `;
    document.body.appendChild(detailModal);
    
    document.getElementById('task-splitter-history-detail-close-btn').onclick = () => {
      detailModal.classList.remove('visible');
    };
  }
  
  const contentEl = document.getElementById('task-splitter-history-detail-content');
  const completedCount = record.completedTasks.length;
  const totalTasks = record.taskGroups.reduce((sum, group) => sum + group.tasks.length, 0);
  
  contentEl.innerHTML = `
    <div>
      <h3 style="margin-bottom: 15px; color: #333; font-size: 18px;">${record.goal}</h3>
      <div style="margin-bottom: 15px; padding: 12px; background: #f0f0f0; border-radius: 8px;">
        <div style="font-size: 13px; color: #666; margin-bottom: 5px;">开始语：</div>
        <div style="font-size: 14px; color: #333; line-height: 1.6;">${record.startMessage}</div>
      </div>
      <div style="margin-bottom: 15px;">
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #333;">任务列表（完成 ${completedCount}/${totalTasks}）：</div>
        ${record.taskGroups.map((group) => `
          ${group.groupName ? `<div style="font-size: 14px; font-weight: bold; margin: 15px 0 8px 0; color: #4CAF50; padding-bottom: 5px; border-bottom: 2px solid #4CAF50;">${group.groupName}</div>` : ''}
          ${group.tasks.map((task) => `
            <div style="padding: 10px; margin: 5px 0; background: ${record.completedTasks.includes(task.id) ? '#e8f5e9' : '#fff3e0'}; border-left: 3px solid ${record.completedTasks.includes(task.id) ? '#4CAF50' : '#ff9800'}; border-radius: 4px;">
              <span style="margin-right: 8px; font-size: 16px;">${record.completedTasks.includes(task.id) ? '✓' : '○'}</span>
              <span style="text-decoration: ${record.completedTasks.includes(task.id) ? 'line-through' : 'none'}; color: ${record.completedTasks.includes(task.id) ? '#999' : '#333'};">
                ${task.content}
              </span>
            </div>
          `).join('')}
        `).join('')}
      </div>
      <div style="margin-top: 15px; padding: 12px; background: #e3f2fd; border-radius: 8px;">
        <div style="font-size: 13px; color: #666; margin-bottom: 5px;">结束语：</div>
        <div style="font-size: 14px; color: #333; line-height: 1.6;">${record.endMessage}</div>
      </div>
      ${record.reward ? `
      <div style="margin-top: 15px; padding: 12px; background: #fff3e0; border-radius: 8px;">
        <div style="font-size: 13px; color: #666; margin-bottom: 5px;">奖励：</div>
        ${record.rewardVisualization ? `
          <div style="margin: 10px 0; padding: 15px; background: white; border-radius: 8px; min-height: 100px;" id="detail-reward-visualization-${record.id}"></div>
        ` : ''}
        <div style="font-size: 14px; color: #333; line-height: 1.6;">${record.reward}</div>
      </div>
      ` : ''}
      <div style="margin-top: 15px; font-size: 12px; color: #999; text-align: center; padding-top: 15px; border-top: 1px solid #eee;">
        创建时间：${new Date(record.createdAt).toLocaleString()}<br>
        完成时间：${new Date(record.completedAt).toLocaleString()}
      </div>
    </div>
  `;
  
  // 渲染奖励可视化（如果有）
  if (record.rewardVisualization) {
    const visualizationEl = document.getElementById(`detail-reward-visualization-${record.id}`);
    if (visualizationEl) {
      try {
        let visualizationHTML = record.rewardVisualization;
        if (record.rewardVisualization.includes('<style>')) {
          const styleMatch = record.rewardVisualization.match(/<style>([\s\S]*?)<\/style>/);
          if (styleMatch) {
            const styleContent = styleMatch[1];
            const styleId = `detail-reward-style-${record.id}`;
            if (!document.getElementById(styleId)) {
              const styleEl = document.createElement('style');
              styleEl.id = styleId;
              styleEl.textContent = styleContent;
              document.head.appendChild(styleEl);
            }
          }
          visualizationHTML = record.rewardVisualization.replace(/<style>[\s\S]*?<\/style>/g, '').trim();
        }
        visualizationEl.innerHTML = visualizationHTML;
      } catch (error) {
        console.error('渲染奖励可视化失败:', error);
        visualizationEl.innerHTML = '<div style="text-align: center; padding: 40px; font-size: 48px;">🎁</div>';
      }
    }
  }
  
  detailModal.classList.add('visible');
}

/**
 * 删除任务记录（包括月历中的任务）
 */
async function deleteTaskRecord(record, index) {
  if (!confirm(`确定要删除这个目标记录吗？\n目标：${record.goal}\n\n这将同时删除该目标在月历中生成的所有行程和待办。`)) {
    return;
  }
  
  try {
    // 删除月历中的任务
    if (record.calendarTaskIds && record.calendarTaskIds.length > 0) {
      for (const taskInfo of record.calendarTaskIds) {
        try {
          if (taskInfo.type === 'event') {
            await db.calendarEvents.delete(taskInfo.id);
          } else if (taskInfo.type === 'todo') {
            await db.calendarTodos.delete(taskInfo.id);
          }
        } catch (error) {
          console.warn(`删除月历任务失败 (${taskInfo.type}:${taskInfo.id}):`, error);
        }
      }
      console.log(`已删除 ${record.calendarTaskIds.length} 个月历任务`);
    }
    
    // 从记录列表中删除
    const records = JSON.parse(localStorage.getItem('task-splitter-records') || '[]');
    records.splice(index, 1);
    localStorage.setItem('task-splitter-records', JSON.stringify(records));
    
    // 重新渲染列表
    openTaskSplitterHistory();
    
    await showCustomAlert('删除成功', '目标记录及相关的月历任务已删除');
  } catch (error) {
    console.error('删除任务记录失败:', error);
    await showCustomAlert('错误', `删除失败：${error.message}`);
  }
}

/**
 * 保存当前任务进度
 */
function saveTaskProgress() {
  if (!currentTaskData || !activeTaskSplitterCharId) return;
  
  try {
    const progressData = {
      charId: currentTaskData.charId,
      goal: currentTaskData.goal,
      goalType: currentTaskData.goalType || 'short',
      currentStatus: currentTaskData.currentStatus,
      startMessage: currentTaskData.startMessage,
      endMessage: currentTaskData.endMessage,
      reward: currentTaskData.reward || '恭喜你完成了目标！', // 奖励内容
      rewardVisualization: currentTaskData.rewardVisualization || '', // 奖励可视化代码
      taskGroups: currentTaskData.taskGroups,
      completedTasks: Array.from(currentTaskData.completedTasks),
      createdAt: currentTaskData.createdAt,
      calendarTaskIds: currentTaskData.calendarTaskIds || [],
      savedAt: Date.now(),
    };
    
    // 使用charId作为key的一部分，这样每个角色有独立的进度
    localStorage.setItem(`task-splitter-progress-${activeTaskSplitterCharId}`, JSON.stringify(progressData));
  } catch (error) {
    console.error('保存任务进度失败:', error);
  }
}

/**
 * 取消当前任务
 */
async function cancelCurrentTask() {
  if (!currentTaskData) return;
  
  try {
    // 如果是长线目标，从月历中删除相关任务
    if (currentTaskData.goalType === 'long' && currentTaskData.calendarTaskIds) {
      for (const calendarTask of currentTaskData.calendarTaskIds) {
        try {
          if (calendarTask.type === 'todo') {
            await db.calendarTodos.delete(calendarTask.id);
          } else if (calendarTask.type === 'event') {
            await db.calendarEvents.delete(calendarTask.id);
          }
        } catch (error) {
          console.warn('删除月历任务失败:', error);
        }
      }
      
      // 刷新月历显示
      if (typeof renderCalendar === 'function' && typeof currentCalendarDate !== 'undefined') {
        await renderCalendar(currentCalendarDate);
      }
    }
    
    // 清除保存的进度
    clearTaskProgress(activeTaskSplitterCharId);
    
    // 重置状态
    currentTaskData = null;
    const chat = state.chats[activeTaskSplitterCharId];
    if (chat) {
      renderTaskSplitterInitialView(chat);
    }
    hideDialogBubble();
    
    // 任务已取消，不需要提示
  } catch (error) {
    console.error('取消任务失败:', error);
    await showCustomAlert('错误', '取消任务失败，请重试');
  }
}

/**
 * 加载保存的任务进度
 * @param {string} charId - 角色ID
 * @returns {object|null} - 保存的进度数据，如果没有则返回null
 */
function loadTaskProgress(charId) {
  try {
    const savedData = localStorage.getItem(`task-splitter-progress-${charId}`);
    if (!savedData) return null;
    
    const progressData = JSON.parse(savedData);
    
    // 检查数据是否完整
    if (!progressData.taskGroups || progressData.taskGroups.length === 0) {
      return null;
    }
    
    return progressData;
  } catch (error) {
    console.error('加载任务进度失败:', error);
    return null;
  }
}

/**
 * 清除保存的任务进度
 * @param {string} charId - 角色ID
 */
function clearTaskProgress(charId) {
  try {
    localStorage.removeItem(`task-splitter-progress-${charId}`);
  } catch (error) {
    console.error('清除任务进度失败:', error);
  }
}

/**
 * 检查角色是否有进行中的任务
 * @param {string} charId - 角色ID
 * @returns {boolean} 是否有进行中的任务
 */
function checkCharHasActiveTask(charId) {
  try {
    const savedProgress = loadTaskProgress(charId);
    if (!savedProgress || !savedProgress.taskGroups || savedProgress.taskGroups.length === 0) {
      return false;
    }
    
    // 检查是否所有任务都已完成
    const completedTasks = new Set(savedProgress.completedTasks || []);
    const allTasksCompleted = savedProgress.taskGroups.every(group =>
      group.tasks.every(task => completedTasks.has(task.id))
    );
    
    return !allTasksCompleted;
  } catch (error) {
    console.error('检查任务状态失败:', error);
    return false;
  }
}

// 将函数暴露到全局作用域，供其他模块使用
if (typeof window !== 'undefined') {
  window.checkCharHasActiveTask = checkCharHasActiveTask;
  window.syncCalendarTaskCompletion = syncCalendarTaskCompletion;
  window.loadTaskProgress = loadTaskProgress;
}

/**
 * 将长线目标的任务添加到月历
 * @param {Array} taskGroups - 任务分组数组
 * @param {string} charId - 角色ID
 */
async function addTasksToCalendar(taskGroups, charId) {
  if (!db || !db.calendarEvents || !db.calendarTodos) {
    console.warn('数据库未初始化，无法添加到月历');
    return;
  }

  const calendarTaskIds = [];
  let addedCount = 0;
  
  try {
    console.log('开始添加任务到月历，角色ID:', charId);
    console.log('任务分组数量:', taskGroups.length);
    
    for (const group of taskGroups) {
      for (const task of group.tasks) {
        // 确保任务有日期信息
        if (!task.scheduledDate) {
          console.warn(`任务 ${task.id} 没有 scheduledDate，跳过添加到月历`);
          continue;
        }
        
        const dateStr = task.scheduledDate;
        const endDateStr = task.scheduledEndDate || null; // 支持结束日期（日期范围）
        const timeStr = task.scheduledTime || '09:00';
        const isEvent = task.isEvent === true; // 明确转换为布尔值
        const taskContent = task.content;
        const isDaily = task.isDaily || false; // 是否每天重复（例如"每天6点跑步"）
        const repeatDays = task.repeatDays || 0; // 重复天数（例如连续7天）
        
        console.log(`处理任务: ${task.id}, 日期: ${dateStr}, 结束日期: ${endDateStr || '无'}, 时间: ${timeStr}, 类型: ${isEvent ? '行程' : '待办'}, 每天重复: ${isDaily}, 重复天数: ${repeatDays}, 内容: ${taskContent}`);
        
        // 处理日期范围或重复任务
        const datesToAdd = [];
        
        if (endDateStr) {
          // 日期范围任务（例如：1号到5号）
          const startDate = new Date(dateStr);
          const endDate = new Date(endDateStr);
          let currentDate = new Date(startDate);
          
          while (currentDate <= endDate) {
            const dateToAdd = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            datesToAdd.push(dateToAdd);
            currentDate.setDate(currentDate.getDate() + 1);
          }
        } else if (isDaily && repeatDays > 0) {
          // 每天重复任务（例如：每天6点跑步，连续7天）
          const startDate = new Date(dateStr);
          for (let i = 0; i < repeatDays; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const dateToAdd = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            datesToAdd.push(dateToAdd);
          }
        } else if (isDaily) {
          // 每天重复，但没有指定重复天数，默认添加未来30天
          const startDate = new Date(dateStr);
          for (let i = 0; i < 30; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const dateToAdd = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            datesToAdd.push(dateToAdd);
          }
        } else {
          // 单日任务
          datesToAdd.push(dateStr);
        }
        
        console.log(`任务 ${task.id} 需要添加到 ${datesToAdd.length} 个日期:`, datesToAdd);
        
        // 为每个日期添加任务
        for (const dateToAdd of datesToAdd) {
          // 检查该日期是否已存在该任务
          let existingTask = null;
          try {
            if (isEvent) {
              const existingEvents = await db.calendarEvents
                .where('date')
                .equals(dateToAdd)
                .toArray();
              existingTask = existingEvents.find(e => 
                e.taskSplitterId === task.id && e.taskSplitterCharId === charId
              );
            } else {
              const existingTodos = await db.calendarTodos
                .where('date')
                .equals(dateToAdd)
                .toArray();
              existingTask = existingTodos.find(t => 
                t.taskSplitterId === task.id && t.taskSplitterCharId === charId
              );
            }
          } catch (error) {
            console.warn(`检查任务 ${task.id} 在日期 ${dateToAdd} 是否存在时出错:`, error);
          }
          
          if (existingTask) {
            // 如果已存在，使用现有的ID
            console.log(`任务 ${task.id} 在日期 ${dateToAdd} 已存在于月历，ID: ${existingTask.id}`);
            calendarTaskIds.push({ 
              type: isEvent ? 'event' : 'todo', 
              id: existingTask.id, 
              taskId: task.id,
              date: dateToAdd
            });
            continue;
          }
          
          if (isEvent) {
            // 添加到行程
            const eventData = {
              date: dateToAdd,
              startTime: timeStr,
              endTime: '',
              time: timeStr,
              content: taskContent,
              categoryId: null,
              type: 'event',
              taskSplitterId: task.id, // 关联到任务拆分器的任务ID
              taskSplitterCharId: charId,
            };
            console.log(`添加行程到月历 (${dateToAdd}):`, eventData);
            const eventId = await db.calendarEvents.add(eventData);
            console.log('行程添加成功，ID:', eventId);
            calendarTaskIds.push({ type: 'event', id: eventId, taskId: task.id, date: dateToAdd });
            addedCount++;
          } else {
            // 添加到待办
            const todoData = {
              date: dateToAdd,
              content: taskContent,
              completed: false,
              taskSplitterId: task.id, // 关联到任务拆分器的任务ID
              taskSplitterCharId: charId,
            };
            console.log(`添加待办到月历 (${dateToAdd}):`, todoData);
            const todoId = await db.calendarTodos.add(todoData);
            console.log('待办添加成功，ID:', todoId);
            calendarTaskIds.push({ type: 'todo', id: todoId, taskId: task.id, date: dateToAdd });
            addedCount++;
          }
        }
      }
    }
    
    console.log(`总共添加了 ${addedCount} 个任务到月历`);
    console.log('calendarTaskIds:', calendarTaskIds);
    
    // 保存到currentTaskData
    if (currentTaskData) {
      currentTaskData.calendarTaskIds = calendarTaskIds;
      console.log('已保存calendarTaskIds到currentTaskData');
    }
    
    // 刷新月历显示
    if (typeof renderCalendar === 'function' && typeof currentCalendarDate !== 'undefined') {
      console.log('刷新月历显示...');
      await renderCalendar(currentCalendarDate);
    } else {
      console.warn('renderCalendar函数不可用或currentCalendarDate未定义');
    }
  } catch (error) {
    console.error('添加任务到月历失败:', error);
    console.error('错误堆栈:', error.stack);
  }
}

/**
 * 从月历同步任务完成状态到拆分器
 * @param {string} taskId - 任务拆分器的任务ID
 * @param {boolean} completed - 是否完成
 */
async function syncCalendarTaskCompletion(taskId, completed) {
  if (!currentTaskData || !activeTaskSplitterCharId) return;
  
  // 设置标志，防止循环同步
  isSyncingFromCalendar = true;
  
  try {
    // 更新拆分器的完成状态
    if (completed) {
      currentTaskData.completedTasks.add(taskId);
      
      // 找到对应的任务，显示预生成的完成消息
      for (const group of currentTaskData.taskGroups) {
        const task = group.tasks.find(t => t.id === taskId);
        if (task && task.completionMessage) {
          showDialogBubble(task.completionMessage);
          break;
        }
      }
    } else {
      currentTaskData.completedTasks.delete(taskId);
    }
    
    // 保存进度
    saveTaskProgress();
    
    // 更新UI
    renderTaskList();
    
    // 检查是否所有任务完成
    const allTasksCompleted = currentTaskData.taskGroups.every(group =>
      group.tasks.every(task => currentTaskData.completedTasks.has(task.id))
    );
    
    if (allTasksCompleted) {
      await showTaskCompletion();
    }
  } finally {
    // 重置标志
    isSyncingFromCalendar = false;
  }
}

/**
 * 从拆分器同步任务完成状态到月历
 * @param {string} taskId - 任务拆分器的任务ID
 * @param {boolean} completed - 是否完成
 */
async function syncTaskSplitterCompletionToCalendar(taskId, completed) {
  if (!currentTaskData || !currentTaskData.calendarTaskIds) return;
  
  try {
    // 找到对应的月历任务
    const calendarTask = currentTaskData.calendarTaskIds.find(ct => ct.taskId === taskId);
    if (!calendarTask) return;
    
    if (calendarTask.type === 'todo') {
      // 更新待办状态
      await db.calendarTodos.update(calendarTask.id, { completed });
      // 刷新月历显示
      if (typeof renderCalendar === 'function' && typeof currentCalendarDate !== 'undefined') {
        await renderCalendar(currentCalendarDate);
      }
      if (selectedDate && typeof loadTodos === 'function') {
        await loadTodos(selectedDate);
      }
    }
    // 行程不需要更新完成状态，因为行程是时间点事件
  } catch (error) {
    console.error('同步任务完成状态到月历失败:', error);
  }
}
