/**
 * 日历App功能
 */

let currentCalendarDate = new Date();
let selectedDate = null; // 当前选中的日期 (YYYY-MM-DD格式)
let currentTab = 'events'; // 当前显示的标签：'events' 或 'todos'

// 将selectedDate暴露到全局作用域，供桌宠等功能使用
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'selectedDate', {
    get: () => selectedDate,
    set: (value) => { selectedDate = value; },
    enumerable: true,
    configurable: true
  });
}

/**
 * 初始化日历App
 */
async function initCalendar() {
  // 等待一小段时间确保DOM和数据库都准备好
  await new Promise(resolve => setTimeout(resolve, 100));
  // 默认选中今天
  selectedDate = formatDate(new Date());
  // 渲染当前月份
  await renderCalendar(currentCalendarDate);
  // 加载今天的信息
  await loadDayInfo(selectedDate);

  // 控制漂浮气泡的显示/隐藏
  const calendarScreen = document.getElementById('calendar-screen');
  const floatingAddBtn = document.getElementById('calendar-floating-add-btn');

  // 监听屏幕切换
  const observer = new MutationObserver(() => {
    if (calendarScreen && floatingAddBtn) {
      if (calendarScreen.classList.contains('active')) {
        floatingAddBtn.style.display = 'flex';

        // 每次进入月历时，自动选中今天（使用立即执行的异步函数）
        (async () => {
          const today = formatDate(new Date());
          const todayDate = new Date();
          const currentYear = todayDate.getFullYear();
          const currentMonth = todayDate.getMonth();

          // 如果当前显示的月份不是今天所在的月份，切换到当前月份
          if (currentCalendarDate.getFullYear() !== currentYear ||
            currentCalendarDate.getMonth() !== currentMonth) {
            currentCalendarDate = new Date(currentYear, currentMonth, 1);
          }

          // 如果当前没有选中日期，或者选中的不是今天，则选中今天
          if (!selectedDate || selectedDate !== today) {
            selectedDate = today;
            // 重新渲染日历以显示选中状态
            await renderCalendar(currentCalendarDate);
            // 加载今天的信息
            await loadDayInfo(selectedDate);
          } else {
            // 即使已经选中今天，也确保日历已正确渲染（防止月份切换后状态丢失）
            await renderCalendar(currentCalendarDate);
          }
        })();
      } else {
        floatingAddBtn.style.display = 'none';
      }
    }
  });

  if (calendarScreen) {
    observer.observe(calendarScreen, { attributes: true, attributeFilter: ['class'] });
    // 初始化显示状态
    if (calendarScreen.classList.contains('active') && floatingAddBtn) {
      floatingAddBtn.style.display = 'flex';
      // 如果初始化时日历界面已经激活，确保选中今天（使用立即执行的异步函数）
      (async () => {
        const today = formatDate(new Date());
        const todayDate = new Date();
        const currentYear = todayDate.getFullYear();
        const currentMonth = todayDate.getMonth();

        // 如果当前显示的月份不是今天所在的月份，切换到当前月份
        if (currentCalendarDate.getFullYear() !== currentYear ||
          currentCalendarDate.getMonth() !== currentMonth) {
          currentCalendarDate = new Date(currentYear, currentMonth, 1);
        }

        // 确保选中今天
        if (!selectedDate || selectedDate !== today) {
          selectedDate = today;
          // 重新渲染日历以显示选中状态
          await renderCalendar(currentCalendarDate);
          // 加载今天的信息
          await loadDayInfo(selectedDate);
        }
      })();
    }
  }

  // 绑定月份切换按钮
  document.getElementById('calendar-prev-month').addEventListener('click', async () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    await renderCalendar(currentCalendarDate);
  });

  document.getElementById('calendar-next-month').addEventListener('click', async () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    await renderCalendar(currentCalendarDate);
  });

  // 绑定"今天"按钮
  document.getElementById('calendar-today-btn').addEventListener('click', async () => {
    currentCalendarDate = new Date();
    selectedDate = formatDate(new Date());
    await renderCalendar(currentCalendarDate);
    await loadDayInfo(selectedDate);
  });

  // 绑定标签切换
  document.getElementById('calendar-tab-events').addEventListener('click', () => switchTab('events'));
  document.getElementById('calendar-tab-todos').addEventListener('click', () => switchTab('todos'));

  // ==========================================
  // 【终极修复】: 漂浮气泡交互 - 使用全屏透明遮罩层 (Backdrop Strategy)
  // ==========================================
  const floatingAddBtnEl = document.getElementById('calendar-floating-add-btn');
  const addTypeMenu = document.getElementById('calendar-add-type-menu');
  let isAddMenuOpen = false; // ⭐ 记录气泡是否展开

  if (floatingAddBtnEl && addTypeMenu) {

    // 1. 动态创建一个透明遮罩层，用于捕获"点击空白处"
    let backdrop = document.getElementById('calendar-menu-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'calendar-menu-backdrop';
      // 设置样式：全屏、透明、层级在菜单之下
      backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 998; /* 确保高层级，但低于菜单 */
        display: none;
        background: transparent; 
        touch-action: manipulation; /* 优化触控 */
      `;
      document.body.appendChild(backdrop);
    }

    // 确保菜单层级最高
    addTypeMenu.style.zIndex = '999';
    // 确保按钮层级合适 (虽然遮罩层在上面，点击遮罩层也会关闭，视觉上像点了按钮)
    floatingAddBtnEl.style.zIndex = '997';

    // 定义打开和关闭逻辑
    const openMenu = () => {
      addTypeMenu.classList.add('visible');
      backdrop.style.display = 'block';
      isAddMenuOpen = true;
    };

    const closeMenu = () => {
      addTypeMenu.classList.remove('visible');
      backdrop.style.display = 'none';
      isAddMenuOpen = false;
    };


    // 2. 按钮点击：切换
    floatingAddBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      isAddMenuOpen ? closeMenu() : openMenu();
    });


    // 3. 遮罩层点击：即点击了页面上除了菜单以外的任何地方（包括按钮位置）
    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
    });

    // 兼容触摸设备，防止点击穿透
    backdrop.addEventListener('touchstart', (e) => {
      e.preventDefault(); // 阻止默认行为，直接关闭
      closeMenu();
    });

    // 4. 菜单项点击逻辑
    const menuItems = [
      { id: 'calendar-menu-add-event', handler: openAddEventModal },
      { id: 'calendar-menu-add-todo', handler: openAddTodoModal },
      // 不再提供 { id: 'calendar-menu-add-period', handler: openAddPeriodModal }
    ];

    menuItems.forEach(item => {
      const el = document.getElementById(item.id);
      if (el) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          closeMenu(); // 点击选项后关闭菜单和遮罩
          item.handler();
        });
        // 悬停效果
        el.addEventListener('mouseenter', () => el.style.backgroundColor = 'var(--secondary-bg)');
        el.addEventListener('mouseleave', () => el.style.backgroundColor = 'transparent');
      }
    });

    // 5. 按钮悬停效果
    floatingAddBtnEl.addEventListener('mouseenter', () => {
      floatingAddBtnEl.style.transform = 'scale(1.1)';
      floatingAddBtnEl.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
    });
    floatingAddBtnEl.addEventListener('mouseleave', () => {
      floatingAddBtnEl.style.transform = 'scale(1)';
      floatingAddBtnEl.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    });
  }

  // 绑定保存和取消按钮
  document.getElementById('calendar-save-event-btn').addEventListener('click', () => saveEvent());
  document.getElementById('calendar-cancel-event-btn').addEventListener('click', () => closeAddEventModal());
  document.getElementById('calendar-close-event-modal').addEventListener('click', () => closeAddEventModal());

  document.getElementById('calendar-save-todo-btn').addEventListener('click', () => saveTodo());
  document.getElementById('calendar-cancel-todo-btn').addEventListener('click', () => closeAddTodoModal());
  document.getElementById('calendar-close-todo-modal').addEventListener('click', () => closeAddTodoModal());

  // 绑定分类管理按钮
  document.getElementById('calendar-manage-categories-btn').addEventListener('click', () => openCategoriesModal());
  document.getElementById('calendar-close-categories-modal').addEventListener('click', () => closeCategoriesModal());
  document.getElementById('calendar-close-categories-btn').addEventListener('click', () => closeCategoriesModal());
  document.getElementById('calendar-add-category-btn').addEventListener('click', () => openCategoryEditModal());
  document.getElementById('calendar-save-category-btn').addEventListener('click', () => saveCategory());
  document.getElementById('calendar-cancel-category-edit-btn').addEventListener('click', () => closeCategoryEditModal());
  document.getElementById('calendar-close-category-edit-modal').addEventListener('click', () => closeCategoryEditModal());

  // 绑定月经记录按钮
  //document.getElementById('calendar-save-period-btn').addEventListener('click', () => savePeriod());
  //document.getElementById('calendar-cancel-period-btn').addEventListener('click', () => closeAddPeriodModal());
  //document.getElementById('calendar-close-period-modal').addEventListener('click', () => closeAddPeriodModal());

  // 加载分类列表
  loadCategories();
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 将数字转换为罗马数字
 */
function toRomanNumeral(num) {
  const romanNumerals = [
    { value: 1000, numeral: 'M' },
    { value: 900, numeral: 'CM' },
    { value: 500, numeral: 'D' },
    { value: 400, numeral: 'CD' },
    { value: 100, numeral: 'C' },
    { value: 90, numeral: 'XC' },
    { value: 50, numeral: 'L' },
    { value: 40, numeral: 'XL' },
    { value: 10, numeral: 'X' },
    { value: 9, numeral: 'IX' },
    { value: 5, numeral: 'V' },
    { value: 4, numeral: 'IV' },
    { value: 1, numeral: 'I' }
  ];

  let result = '';
  for (const { value, numeral } of romanNumerals) {
    const count = Math.floor(num / value);
    result += numeral.repeat(count);
    num -= value * count;
  }
  return result;
}

/**
 * 渲染日历
 * @param {Date} date - 要显示的月份日期
 */
async function renderCalendar(date) {
  // 类型检查：确保传入的是Date对象
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    console.error('renderCalendar: 参数必须是有效的Date对象，收到:', date);
    // 如果传入的不是Date对象，尝试转换
    if (typeof date === 'number') {
      date = new Date(date);
    } else if (typeof date === 'string') {
      date = new Date(date);
    } else {
      // 如果无法转换，使用当前日期
      console.warn('renderCalendar: 无法转换参数为Date对象，使用当前日期');
      date = new Date();
    }
  }

  const year = date.getFullYear();
  const month = date.getMonth();
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  // 检查DOM元素是否存在
  const monthYearEl = document.getElementById('calendar-month-year');
  const grid = document.getElementById('calendar-grid');

  if (!monthYearEl || !grid) {
    console.warn('日历DOM元素未找到，可能还未加载完成');
    return;
  }

  // 更新月份年份标题（只显示数字，不用年和月字）
  monthYearEl.textContent = `${year} ${month + 1}`;

  // 获取月份的第一天和最后一天
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = 星期日

  // 清空日历网格
  grid.innerHTML = '';

  // 清除所有之前的选中状态标记，确保只有当前selectedDate被选中
  // 如果selectedDate不在当前月份，则清除选中状态
  const currentMonthStart = formatDate(new Date(year, month, 1));
  const currentMonthEnd = formatDate(new Date(year, month + 1, 0));
  if (selectedDate && (selectedDate < currentMonthStart || selectedDate > currentMonthEnd)) {
    selectedDate = null;
  }

  // 添加空白单元格（月初之前的空白）
  for (let i = 0; i < startingDayOfWeek; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.style.padding = '12px';
    emptyCell.style.minHeight = '50px';
    grid.appendChild(emptyCell);
  }

  // 获取该月所有有行程和待办事项的日期（用于显示卡片）
  const monthStart = formatDate(new Date(year, month, 1));
  const monthEnd = formatDate(new Date(year, month + 1, 0));

  // 使用 try-catch 处理数据库查询错误，确保即使查询失败也能显示日期
  let eventsByDate = new Map(); // 按日期分组的行程
  let todosByDate = new Map(); // 按日期分组的待办

  try {
    if (db && db.calendarEvents) {
      const eventsInMonth = await db.calendarEvents
        .where('date')
        .between(monthStart, monthEnd, true, true)
        .toArray();

      // 按日期分组
      eventsInMonth.forEach(event => {
        if (!eventsByDate.has(event.date)) {
          eventsByDate.set(event.date, []);
        }
        eventsByDate.get(event.date).push(event);
      });

      // 对每个日期的行程按时间排序
      eventsByDate.forEach((events, date) => {
        events.sort((a, b) => {
          const aTime = a.startTime || a.time || '';
          const bTime = b.startTime || b.time || '';
          return aTime.localeCompare(bTime);
        });
      });
    }
  } catch (error) {
    console.warn('查询行程数据失败:', error);
  }

  try {
    if (db && db.calendarTodos) {
      const todosInMonth = await db.calendarTodos
        .where('date')
        .between(monthStart, monthEnd, true, true)
        .toArray();

      // 按日期分组，并按id排序（新添加的在后面）
      todosInMonth.forEach(todo => {
        if (!todosByDate.has(todo.date)) {
          todosByDate.set(todo.date, []);
        }
        todosByDate.get(todo.date).push(todo);
      });

      // 对每个日期的待办按id排序（新添加的在后面）
      todosByDate.forEach((todos, date) => {
        todos.sort((a, b) => a.id - b.id);
      });
    }
  } catch (error) {
    console.warn('查询待办数据失败:', error);
  }

  // 获取所有分类
  let categories = new Map();
  try {
    if (db && db.calendarCategories) {
      const allCategories = await db.calendarCategories.toArray();
      allCategories.forEach(cat => {
        categories.set(cat.id, cat);
      });
    }
  } catch (error) {
    console.warn('查询分类数据失败:', error);
  }


  // 获取该月所有有月经记录的日期（男生版：不再使用，经期集合保持为空）
  let periodDates = new Set();
  // 原本这里会从 db.calendarPeriods 读取数据填充 periodDates，
  // 现在直接略过，不再显示经期高亮。


  // 添加日期单元格
  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(year, month, day);
    const dateStr = formatDate(dayDate);
    const isToday = isCurrentMonth && day === today.getDate();

    // 获取该日期的行程和待办事项
    const dayEvents = eventsByDate.get(dateStr) || [];
    const dayTodos = todosByDate.get(dateStr) || [];
    const hasAnyItem = dayEvents.length > 0 || dayTodos.length > 0;

    // 检查是否有月经记录
    const hasPeriod = periodDates.has(dateStr);

    const isSelected = selectedDate === dateStr;

    const dayCell = document.createElement('div');
    dayCell.setAttribute('data-date', dateStr); // 添加data-date属性，方便查找
    dayCell.style.padding = '4px';
    dayCell.style.minHeight = '80px';
    dayCell.style.borderRadius = '8px';
    dayCell.style.cursor = 'pointer';
    dayCell.style.transition = 'all 0.2s';
    dayCell.style.display = 'flex';
    dayCell.style.flexDirection = 'column';
    dayCell.style.alignItems = 'stretch';
    dayCell.style.justifyContent = 'flex-start';
    dayCell.style.fontSize = '14px';
    dayCell.style.fontWeight = '500';
    dayCell.style.position = 'relative';
    dayCell.style.overflow = 'hidden';

    // 日期数字
    const dayNumber = document.createElement('div');
    dayNumber.textContent = day;
    dayNumber.style.textAlign = 'center';
    dayNumber.style.fontSize = '16px';
    dayNumber.style.fontWeight = '600';
    dayNumber.style.marginBottom = '2px';
    dayNumber.style.lineHeight = '1.2';
    dayCell.appendChild(dayNumber);

    // 设置样式（在创建dayNumber之后）
    // 优先级：选中状态 > 月经记录 > 今天标记
    if (isSelected) {
      // 选中状态统一深蓝底+白字，月经日也保持一致
      dayCell.style.setProperty('background-color', 'var(--accent-color)', 'important');
      dayCell.style.setProperty('border', '2px solid var(--accent-color)', 'important');
      dayCell.style.setProperty('color', 'white', 'important');
      dayNumber.style.setProperty('color', 'white', 'important');
      dayCell.classList.add('calendar-day-selected');
    } else if (hasPeriod) {
      // 有月经记录的日子显示粉红色背景
      dayCell.style.setProperty('background-color', '#ffb3d9', 'important');
      dayCell.style.setProperty('color', 'var(--text-primary)', 'important');
      dayCell.style.setProperty('border', '2px solid #ff99cc', 'important');
      dayNumber.style.setProperty('color', 'var(--text-primary)', 'important');
      dayCell.classList.remove('calendar-day-selected');
    } else if (isToday) {
      // 今天标记：蓝色边框，透明或浅色背景
      dayCell.style.backgroundColor = 'rgba(var(--accent-color-rgb), 0.2)';
      dayCell.style.color = 'var(--accent-color)';
      dayCell.style.border = '2px solid var(--accent-color)';
      dayNumber.style.color = 'var(--accent-color)';
      dayCell.classList.remove('calendar-day-selected');
    } else {
      dayCell.style.color = 'var(--text-primary)';
      dayCell.style.border = '2px solid transparent';
      dayCell.style.backgroundColor = 'transparent';
      dayNumber.style.color = 'var(--text-primary)';
      dayCell.classList.remove('calendar-day-selected');
    }

    // 如果今天有月经记录，需要同时显示粉色背景和蓝色边框
    if (isToday && hasPeriod && !isSelected) {
      dayCell.style.setProperty('background-color', '#ffb3d9', 'important');
      dayCell.style.setProperty('border', '2px solid var(--accent-color)', 'important');
    }

    // 创建内容容器
    const contentContainer = document.createElement('div');
    contentContainer.style.display = 'flex';
    contentContainer.style.flexDirection = 'column';
    contentContainer.style.gap = '2px';
    contentContainer.style.flex = '1';
    contentContainer.style.overflow = 'hidden';
    dayCell.appendChild(contentContainer);

    // 显示待办事项（优先显示，在最前面，包括已完成的）
    dayTodos.forEach(todo => {
      const todoCard = document.createElement('div');
      todoCard.style.display = 'flex';
      todoCard.style.alignItems = 'center';
      todoCard.style.gap = '4px';
      todoCard.style.padding = '2px 4px';
      todoCard.style.borderRadius = '4px';
      todoCard.style.fontSize = '10px';
      todoCard.style.lineHeight = '1.2';
      todoCard.style.overflow = 'hidden';
      todoCard.style.textOverflow = 'ellipsis';
      todoCard.style.whiteSpace = 'nowrap';
      todoCard.style.backgroundColor = '#ff9800';
      todoCard.style.color = 'white';
      todoCard.style.border = '1px solid #ff9800';

      // 添加勾选框
      const checkbox = document.createElement('span');
      checkbox.textContent = todo.completed ? '✓' : '○';
      checkbox.style.fontSize = '8px';
      checkbox.style.lineHeight = '1';
      checkbox.style.flexShrink = '0';

      // 添加内容
      const contentSpan = document.createElement('span');
      contentSpan.textContent = todo.content;
      if (todo.completed) {
        contentSpan.style.textDecoration = 'line-through';
        contentSpan.style.opacity = '0.7';
      }
      contentSpan.style.flex = '1';
      contentSpan.style.overflow = 'hidden';
      contentSpan.style.textOverflow = 'ellipsis';
      contentSpan.style.whiteSpace = 'nowrap';

      todoCard.appendChild(checkbox);
      todoCard.appendChild(contentSpan);
      contentContainer.appendChild(todoCard);
    });

    // 显示行程（按时间排序）
    dayEvents.forEach(event => {
      const eventCard = document.createElement('div');
      eventCard.style.padding = '2px 4px';
      eventCard.style.borderRadius = '4px';
      eventCard.style.fontSize = '10px';
      eventCard.style.lineHeight = '1.2';
      eventCard.style.overflow = 'hidden';
      eventCard.style.textOverflow = 'ellipsis';
      eventCard.style.whiteSpace = 'nowrap';

      // 获取分类颜色
      let bgColor = '#4CAF50';
      let borderColor = '#4CAF50';
      if (event.categoryId && categories.has(event.categoryId)) {
        const category = categories.get(event.categoryId);
        bgColor = category.color || '#4CAF50';
        borderColor = category.color || '#4CAF50';
      }

      eventCard.style.backgroundColor = bgColor;
      eventCard.style.color = 'white';
      eventCard.style.border = `1px solid ${borderColor}`;

      // 只显示内容，不显示时间
      eventCard.textContent = event.content;
      contentContainer.appendChild(eventCard);
    });

    // 点击事件
    dayCell.addEventListener('click', async () => {
      const previousSelectedDate = selectedDate;
      selectedDate = dateStr;

      // 如果选中的日期不在当前显示的月份，切换到那个月份并重新渲染
      if (year !== currentCalendarDate.getFullYear() || month !== currentCalendarDate.getMonth()) {
        currentCalendarDate = new Date(year, month, day);
        await renderCalendar(currentCalendarDate);
        await loadDayInfo(selectedDate);
      } else {
        // 如果是在当前月份内切换，只更新选中状态的样式，不重新渲染整个日历
        // 首先清除所有日期的选中状态（包括之前选中的）
        const allDayCells = grid.querySelectorAll('[data-date]');
        allDayCells.forEach(cell => {
          const cellDateStr = cell.getAttribute('data-date');
          const cellDateObj = new Date(cellDateStr);
          const cellYear = cellDateObj.getFullYear();
          const cellMonth = cellDateObj.getMonth();
          const cellDay = cellDateObj.getDate();
          const isCellToday = isCurrentMonth && cellYear === today.getFullYear() && cellMonth === today.getMonth() && cellDay === today.getDate();
          const cellHasPeriod = periodDates.has(cellDateStr);

          // 移除选中标记
          cell.classList.remove('calendar-day-selected');

          // 恢复原始样式
          if (isCellToday && cellHasPeriod) {
            // 今天且有月经记录：粉色背景+蓝色边框
            cell.style.setProperty('background-color', '#ffb3d9', 'important');
            cell.style.setProperty('color', 'var(--text-primary)', 'important');
            cell.style.setProperty('border', '2px solid var(--accent-color)', 'important');
            const cellDayNumber = cell.querySelector('div:first-child');
            if (cellDayNumber) cellDayNumber.style.setProperty('color', 'var(--text-primary)', 'important');
          } else if (isCellToday) {
            // 今天但无月经记录
            cell.style.setProperty('background-color', 'rgba(var(--accent-color-rgb), 0.2)', 'important');
            cell.style.setProperty('color', 'var(--accent-color)', 'important');
            cell.style.setProperty('border', '2px solid var(--accent-color)', 'important');
            const cellDayNumber = cell.querySelector('div:first-child');
            if (cellDayNumber) cellDayNumber.style.setProperty('color', 'var(--accent-color)', 'important');
          } else if (cellHasPeriod) {
            // 有月经记录但不是今天
            cell.style.setProperty('background-color', '#ffb3d9', 'important');
            cell.style.setProperty('color', 'var(--text-primary)', 'important');
            cell.style.setProperty('border', '2px solid #ff99cc', 'important');
            const cellDayNumber = cell.querySelector('div:first-child');
            if (cellDayNumber) cellDayNumber.style.setProperty('color', 'var(--text-primary)', 'important');
          } else {
            // 普通日期
            cell.style.setProperty('background-color', 'transparent', 'important');
            cell.style.setProperty('color', 'var(--text-primary)', 'important');
            cell.style.setProperty('border', '2px solid transparent', 'important');
            const cellDayNumber = cell.querySelector('div:first-child');
            if (cellDayNumber) cellDayNumber.style.setProperty('color', 'var(--text-primary)', 'important');
          }
        });

        // 更新当前选中日期的样式 - 使用setProperty确保样式优先级
        dayCell.style.setProperty('background-color', 'var(--accent-color)', 'important');
        dayCell.style.setProperty('border', '2px solid var(--accent-color)', 'important');
        dayCell.style.setProperty('color', 'white', 'important');
        dayNumber.style.setProperty('color', 'white', 'important');
        dayCell.classList.add('calendar-day-selected');

        loadDayInfo(selectedDate);
      }
    });

    // 鼠标悬停效果
    dayCell.addEventListener('mouseenter', () => {
      // 如果已选中，不改变样式
      if (dayCell.classList.contains('calendar-day-selected')) {
        return;
      }
      // 如果有月经记录，悬停时保持粉色背景
      if (hasPeriod) {
        dayCell.style.setProperty('background-color', '#ffb3d9', 'important');
        return;
      }
      if (!isSelected && !isToday) {
        dayCell.style.backgroundColor = 'var(--secondary-bg)';
      }
    });
    dayCell.addEventListener('mouseleave', () => {
      // 如果已选中，保持选中样式
      if (dayCell.classList.contains('calendar-day-selected')) {
        dayCell.style.setProperty('background-color', 'var(--accent-color)', 'important');
        dayCell.style.setProperty('border', '2px solid var(--accent-color)', 'important');
        dayCell.style.setProperty('color', 'white', 'important');
        dayNumber.style.setProperty('color', 'white', 'important');
        return;
      }
      // 如果有月经记录，恢复粉色背景
      if (hasPeriod) {
        if (isToday) {
          dayCell.style.setProperty('background-color', '#ffb3d9', 'important');
          dayCell.style.setProperty('border', '2px solid var(--accent-color)', 'important');
        } else {
          dayCell.style.setProperty('background-color', '#ffb3d9', 'important');
          dayCell.style.setProperty('border', '2px solid #ff99cc', 'important');
        }
        return;
      }
      if (!isSelected && !isToday) {
        dayCell.style.backgroundColor = 'transparent';
      }
    });

    // 添加长按事件处理月经记录
    // 男生版：不再提供“长按日期设置月经”的功能
    /*
    if (typeof addLongPressListener === 'function') {
      addLongPressListener(dayCell, () => {
        // 长按打开编辑该日期的月经记录
        openEditPeriodDateModal(dateStr);
      });
    }
    */
    grid.appendChild(dayCell);
  }
}

/**
 * 加载选中日期的信息
 */
async function loadDayInfo(dateStr) {
  const dateObj = new Date(dateStr);
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();

  // 只显示月日，使用中文格式：1月1日
  const dateText = `${month}月${day}日`;
  document.getElementById('calendar-selected-date').textContent = dateText;

  // 显示日期信息区域，并设置为独立卡片样式
  const dayInfoEl = document.getElementById('calendar-day-info');
  document.getElementById('calendar-no-selection').style.display = 'none';
  dayInfoEl.style.display = 'block';

  // 设置卡片样式：泡泡框样式
  dayInfoEl.style.padding = '20px';
  dayInfoEl.style.borderRadius = '16px';
  dayInfoEl.style.backgroundColor = 'var(--secondary-bg)';
  dayInfoEl.style.border = '1px solid var(--border-color)';
  dayInfoEl.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.08)';
  dayInfoEl.style.margin = '0';
  dayInfoEl.style.position = 'relative';

  // 添加卡片关闭按钮（如果还没有的话）
  let closeBtn = dayInfoEl.querySelector('.calendar-card-close-btn');
  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.className = 'calendar-card-close-btn';
    closeBtn.textContent = '❌';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '12px';
    closeBtn.style.right = '12px';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '4px';
    closeBtn.style.width = '28px';
    closeBtn.style.height = '28px';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.transition = 'background-color 0.2s';
    closeBtn.style.zIndex = '10';
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
    });
    closeBtn.addEventListener('click', () => {
      dayInfoEl.style.display = 'none';
      document.getElementById('calendar-no-selection').style.display = 'block';
      selectedDate = null; // 清除选中的日期
    });
    dayInfoEl.appendChild(closeBtn);
  }

  // 加载行程和待办事项
  await loadEvents(dateStr);
  await loadTodos(dateStr);
}

/**
 * 加载行程列表
 */
async function loadEvents(dateStr) {
  const events = await db.calendarEvents
    .where('date')
    .equals(dateStr)
    .sortBy('startTime');

  const eventsList = document.getElementById('calendar-events-list');
  eventsList.innerHTML = '';

  if (events.length === 0) {
    eventsList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">暂无行程</p>';
    return;
  }

  events.forEach(event => {
    const eventItem = document.createElement('div');
    eventItem.style.padding = '16px';
    eventItem.style.borderRadius = '16px';
    eventItem.style.backgroundColor = 'var(--secondary-bg)';
    eventItem.style.border = '1px solid var(--border-color)';
    eventItem.style.position = 'relative';
    eventItem.style.marginBottom = '12px';
    eventItem.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';

    const eventContent = document.createElement('div');

    const timeDiv = document.createElement('div');
    timeDiv.style.fontSize = '14px';
    timeDiv.style.fontWeight = '600';
    timeDiv.style.color = 'var(--accent-color)';
    timeDiv.style.marginBottom = '8px';

    // 显示时间范围：开始时间 - 结束时间
    const startTime = event.startTime || event.time || ''; // 兼容旧数据
    const endTime = event.endTime || '';
    if (endTime) {
      timeDiv.textContent = `${startTime} - ${endTime}`;
    } else {
      timeDiv.textContent = startTime;
    }

    const contentDiv = document.createElement('div');
    contentDiv.style.fontSize = '14px';
    contentDiv.style.color = 'var(--text-primary)';
    contentDiv.style.lineHeight = '1.5';
    contentDiv.textContent = event.content;

    eventContent.appendChild(timeDiv);
    eventContent.appendChild(contentDiv);

    eventItem.appendChild(eventContent);

    // 添加长按事件
    addLongPressListener(eventItem, () => showEventActionMenu(event, dateStr));

    eventsList.appendChild(eventItem);
  });
}

/**
 * 加载待办事项列表
 */
async function loadTodos(dateStr) {
  const todos = await db.calendarTodos
    .where('date')
    .equals(dateStr)
    .toArray();

  const todosList = document.getElementById('calendar-todos-list');
  todosList.innerHTML = '';

  if (todos.length === 0) {
    todosList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">暂无待办事项</p>';
    return;
  }

  todos.forEach(todo => {
    const todoItem = document.createElement('div');
    todoItem.style.padding = '12px';
    todoItem.style.borderRadius = '8px';
    todoItem.style.backgroundColor = 'var(--secondary-bg)';
    todoItem.style.border = '1px solid var(--border-color)';
    todoItem.style.display = 'flex';
    todoItem.style.alignItems = 'center';
    todoItem.style.gap = '10px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.completed;
    checkbox.style.width = '20px';
    checkbox.style.height = '20px';
    checkbox.style.borderRadius = '4px';
    checkbox.style.cursor = 'pointer';
    checkbox.addEventListener('change', async () => {
      await db.calendarTodos.update(todo.id, { completed: checkbox.checked });
      await loadTodos(dateStr);
      // 更新月历显示，以反映待办状态的变化
      await renderCalendar(currentCalendarDate);

      // 如果这个待办是从任务拆分器来的，同步到拆分器
      if (todo.taskSplitterId && typeof syncCalendarTaskCompletion === 'function') {
        await syncCalendarTaskCompletion(todo.taskSplitterId, checkbox.checked);
      }
    });

    const contentDiv = document.createElement('div');
    contentDiv.style.flex = '1';
    contentDiv.style.fontSize = '14px';
    contentDiv.style.color = todo.completed ? 'var(--text-secondary)' : 'var(--text-primary)';
    contentDiv.style.textDecoration = todo.completed ? 'line-through' : 'none';
    contentDiv.textContent = todo.content;

    todoItem.appendChild(checkbox);
    todoItem.appendChild(contentDiv);

    // 添加长按事件
    addLongPressListener(todoItem, () => showTodoActionMenu(todo, dateStr));

    todosList.appendChild(todoItem);
  });
}

/**
 * 切换标签
 */
function switchTab(tab) {
  currentTab = tab;

  // 更新按钮样式
  document.querySelectorAll('.calendar-tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.style.borderBottomColor = 'transparent';
    btn.style.color = 'var(--text-secondary)';
  });

  if (tab === 'events') {
    const btn = document.getElementById('calendar-tab-events');
    btn.classList.add('active');
    btn.style.borderBottomColor = 'var(--accent-color)';
    btn.style.color = 'var(--accent-color)';
    document.getElementById('calendar-events-content').style.display = 'block';
    document.getElementById('calendar-todos-content').style.display = 'none';
  } else {
    const btn = document.getElementById('calendar-tab-todos');
    btn.classList.add('active');
    btn.style.borderBottomColor = 'var(--accent-color)';
    btn.style.color = 'var(--accent-color)';
    document.getElementById('calendar-events-content').style.display = 'none';
    document.getElementById('calendar-todos-content').style.display = 'block';
  }
}

/**
 * 加载分类列表到下拉框
 */
async function loadCategories() {
  try {
    if (!db || !db.calendarCategories) return;

    const categories = await db.calendarCategories.toArray();
    const categorySelect = document.getElementById('calendar-event-category');
    if (!categorySelect) return;

    // 保存当前选中的值
    const currentValue = categorySelect.value;

    // 清空并重新填充
    categorySelect.innerHTML = '<option value="">无分类</option>';
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.name;
      categorySelect.appendChild(option);
    });

    // 恢复之前选中的值
    if (currentValue) {
      categorySelect.value = currentValue;
    }
  } catch (error) {
    console.warn('加载分类列表失败:', error);
  }
}

/**
 * 打开添加行程模态框
 */
async function openAddEventModal() {
  editingEventId = null;
  const modal = document.getElementById('calendar-add-event-modal');
  modal.classList.add('visible');

  // 设置默认日期为选中的日期
  document.getElementById('calendar-event-date').value = selectedDate || formatDate(new Date());

  // 兼容新旧表单字段
  const startTimeInput = document.getElementById('calendar-event-start-time');
  const timeInput = document.getElementById('calendar-event-time');
  const endTimeInput = document.getElementById('calendar-event-end-time');

  if (startTimeInput) {
    startTimeInput.value = '';
  } else if (timeInput) {
    timeInput.value = '';
  }

  if (endTimeInput) {
    endTimeInput.value = '';
  }

  document.getElementById('calendar-event-content').value = '';
  document.getElementById('calendar-event-category').value = '';

  // 加载分类列表
  await loadCategories();

  // 重置标题
  const header = modal.querySelector('.modal-header span:first-child');
  if (header) header.textContent = '添加行程';
}

/**
 * 关闭添加行程模态框
 */
function closeAddEventModal() {
  document.getElementById('calendar-add-event-modal').classList.remove('visible');
  editingEventId = null;
  // 重置标题
  const header = document.querySelector('#calendar-add-event-modal .modal-header span:first-child');
  if (header) header.textContent = '添加行程';
}

/**
 * 打开添加待办事项模态框
 */
function openAddTodoModal() {
  editingTodoId = null;
  const modal = document.getElementById('calendar-add-todo-modal');
  modal.classList.add('visible');

  // 设置默认日期为选中的日期
  document.getElementById('calendar-todo-date').value = selectedDate || formatDate(new Date());
  document.getElementById('calendar-todo-content').value = '';

  // 重置标题
  const header = modal.querySelector('.modal-header span:first-child');
  if (header) header.textContent = '添加待办事项';
}

/**
 * 关闭添加待办事项模态框
 */
function closeAddTodoModal() {
  document.getElementById('calendar-add-todo-modal').classList.remove('visible');
}

/**
 * 显示行程操作菜单（编辑/删除）
 */
function showEventActionMenu(event, dateStr) {
  const options = [
    { text: '编辑', value: 'edit' },
    { text: '删除', value: 'delete' }
  ];

  showChoiceModal('选择操作', options).then(async (choice) => {
    if (choice === 'edit') {
      openEditEventModal(event);
    } else if (choice === 'delete') {
      if (confirm('确定要删除这个行程吗？')) {
        await db.calendarEvents.delete(event.id);
        await loadEvents(dateStr);
        await renderCalendar(currentCalendarDate); // 刷新日历以更新小点
      }
    }
  });
}

/**
 * 显示待办事项操作菜单（编辑/删除）
 */
function showTodoActionMenu(todo, dateStr) {
  const options = [
    { text: '编辑', value: 'edit' },
    { text: '删除', value: 'delete' }
  ];

  showChoiceModal('选择操作', options).then(async (choice) => {
    if (choice === 'edit') {
      openEditTodoModal(todo);
    } else if (choice === 'delete') {
      if (confirm('确定要删除这个待办事项吗？')) {
        await db.calendarTodos.delete(todo.id);
        await loadTodos(dateStr);
      }
    }
  });
}

let editingEventId = null;
let editingTodoId = null;

/**
 * 打开编辑行程模态框
 */
async function openEditEventModal(event) {
  editingEventId = event.id;
  const modal = document.getElementById('calendar-add-event-modal');
  modal.classList.add('visible');

  document.getElementById('calendar-event-date').value = event.date;
  const startTimeInput = document.getElementById('calendar-event-start-time');
  const timeInput = document.getElementById('calendar-event-time');
  if (startTimeInput) {
    startTimeInput.value = event.startTime || event.time || '';
  } else if (timeInput) {
    timeInput.value = event.startTime || event.time || '';
  }
  const endTimeInput = document.getElementById('calendar-event-end-time');
  if (endTimeInput) {
    endTimeInput.value = event.endTime || '';
  }
  document.getElementById('calendar-event-content').value = event.content;

  // 加载分类列表并设置选中的分类
  await loadCategories();
  const categorySelect = document.getElementById('calendar-event-category');
  if (categorySelect) {
    categorySelect.value = event.categoryId || '';
  }

  // 更新标题
  const header = modal.querySelector('.modal-header span:first-child');
  header.textContent = '编辑行程';
}

/**
 * 打开编辑待办事项模态框
 */
function openEditTodoModal(todo) {
  editingTodoId = todo.id;
  const modal = document.getElementById('calendar-add-todo-modal');
  modal.classList.add('visible');

  document.getElementById('calendar-todo-date').value = todo.date;
  document.getElementById('calendar-todo-content').value = todo.content;

  // 更新标题
  const header = modal.querySelector('.modal-header span:first-child');
  header.textContent = '编辑待办事项';
}

/**
 * 修改保存行程函数，支持编辑和分类
 */
async function saveEvent() {
  const date = document.getElementById('calendar-event-date').value;
  const startTime = document.getElementById('calendar-event-start-time')?.value || document.getElementById('calendar-event-time')?.value;
  const endTime = document.getElementById('calendar-event-end-time')?.value || '';
  const content = document.getElementById('calendar-event-content').value.trim();
  const categoryId = document.getElementById('calendar-event-category')?.value || null;

  if (!date || !startTime || !content) {
    alert('请填写完整信息（日期、开始时间和内容为必填项）');
    return;
  }

  const eventData = {
    date,
    startTime,
    endTime: endTime || null,
    time: startTime, // 保留time字段用于兼容
    content,
    categoryId: categoryId ? parseInt(categoryId) : null
  };

  if (editingEventId) {
    // 编辑模式
    await db.calendarEvents.update(editingEventId, eventData);
    editingEventId = null;
    alert('行程已更新！');
  } else {
    // 新建模式
    eventData.type = 'event';
    await db.calendarEvents.add(eventData);
    alert('行程已添加！');
  }

  closeAddEventModal();

  // 如果选中的是当前日期，刷新显示
  if (selectedDate === date) {
    await loadEvents(date);
  }

  // 刷新日历以更新显示
  await renderCalendar(currentCalendarDate);
}

/**
 * 修改保存待办事项函数，支持编辑
 */
async function saveTodo() {
  const date = document.getElementById('calendar-todo-date').value;
  const content = document.getElementById('calendar-todo-content').value.trim();

  if (!date || !content) {
    alert('请填写完整信息');
    return;
  }

  if (editingTodoId) {
    // 编辑模式
    await db.calendarTodos.update(editingTodoId, {
      date,
      content
    });
    editingTodoId = null;
    alert('待办事项已更新！');
  } else {
    // 新建模式
    await db.calendarTodos.add({
      date,
      content,
      completed: false
    });
    alert('待办事项已添加！');
  }

  closeAddTodoModal();

  // 如果选中的是当前日期，刷新显示
  if (selectedDate === date) {
    await loadTodos(date);
  }
}

// 当DOM加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCalendar);
} else {
  initCalendar();
}

/**
 * 获取指定日期的行程和待办事项
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD格式)
 * @returns {Promise<{events: Array, todos: Array}>} 返回行程和待办事项
 */
async function getCalendarDataForDate(dateStr) {
  try {
    if (!db || !db.calendarEvents || !db.calendarTodos) {
      return { events: [], todos: [] };
    }

    const events = await db.calendarEvents
      .where('date')
      .equals(dateStr)
      .toArray();

    // 手动排序（因为可能有些旧数据没有startTime字段）
    events.sort((a, b) => {
      const aTime = a.startTime || a.time || '';
      const bTime = b.startTime || b.time || '';
      return aTime.localeCompare(bTime);
    });

    const todos = await db.calendarTodos
      .where('date')
      .equals(dateStr)
      .toArray();

    return { events, todos };
  } catch (error) {
    console.warn('读取日历数据失败:', error);
    return { events: [], todos: [] };
  }
}

/**
 * 获取今日的行程和待办事项
 * @returns {Promise<{events: Array, todos: Array}>} 返回今日的行程和待办事项
 */
async function getTodayCalendarData() {
  const today = formatDate(new Date());
  return await getCalendarDataForDate(today);
}

/**
 * 获取与指定时间相近的行程和待办事项（用于AI主动提醒）
 * @param {Date} targetTime - 目标时间
 * @param {number} timeRangeMinutes - 时间范围（分钟），默认30分钟
 * @returns {Promise<{events: Array, todos: Array}>} 返回相近时间的行程和待办事项
 */
async function getNearbyCalendarData(targetTime, timeRangeMinutes = 30) {
  try {
    if (!db || !db.calendarEvents || !db.calendarTodos) {
      return { events: [], todos: [] };
    }

    const targetDateStr = formatDate(targetTime);
    const targetHour = targetTime.getHours();
    const targetMinute = targetTime.getMinutes();
    const targetTimeMinutes = targetHour * 60 + targetMinute;

    // 获取当天的所有行程
    const allEvents = await db.calendarEvents
      .where('date')
      .equals(targetDateStr)
      .toArray();

    // 手动排序（因为可能有些旧数据没有startTime字段）
    allEvents.sort((a, b) => {
      const aTime = a.startTime || a.time || '';
      const bTime = b.startTime || b.time || '';
      return aTime.localeCompare(bTime);
    });

    // 筛选出时间相近的行程（在时间范围内）
    const nearbyEvents = allEvents.filter(event => {
      const startTime = event.startTime || event.time;
      if (!startTime) return false;
      const [hour, minute] = startTime.split(':').map(Number);
      const eventTimeMinutes = hour * 60 + minute;
      const timeDiff = Math.abs(eventTimeMinutes - targetTimeMinutes);
      return timeDiff <= timeRangeMinutes;
    });

    // 获取当天的所有待办事项（待办事项没有具体时间，所以返回当天的所有未完成待办）
    const todos = await db.calendarTodos
      .where('date')
      .equals(targetDateStr)
      .filter(todo => !todo.completed)
      .toArray();

    return { events: nearbyEvents, todos };
  } catch (error) {
    console.warn('读取相近时间日历数据失败:', error);
    return { events: [], todos: [] };
  }
}

/**
 * 检测用户当前正在进行的行程
 * @param {Date} currentTime - 当前时间（可选，默认为现在）
 * @returns {Promise<Array>} 返回正在进行的行程数组
 */
async function getCurrentOngoingEvents(currentTime = new Date()) {
  try {
    if (!db || !db.calendarEvents) {
      return [];
    }

    const todayStr = formatDate(currentTime);
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    // 获取当天的所有行程
    const allEvents = await db.calendarEvents
      .where('date')
      .equals(todayStr)
      .toArray();

    // 筛选出正在进行的行程（当前时间在开始时间和结束时间之间）
    const ongoingEvents = allEvents.filter(event => {
      const startTime = event.startTime || event.time;
      if (!startTime) return false;

      const [startHour, startMinute] = startTime.split(':').map(Number);
      const startTimeMinutes = startHour * 60 + startMinute;

      // 如果有结束时间，检查是否在时间范围内
      if (event.endTime) {
        const [endHour, endMinute] = event.endTime.split(':').map(Number);
        const endTimeMinutes = endHour * 60 + endMinute;
        return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
      } else {
        // 如果没有结束时间，只检查是否在开始时间之后（默认持续1小时）
        return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < startTimeMinutes + 60;
      }
    });

    return ongoingEvents;
  } catch (error) {
    console.warn('检测当前正在进行的行程失败:', error);
    return [];
  }
}

/**
 * 根据内容查找待办事项（用于AI更新状态）
 * @param {string} content - 待办事项的内容（可以是部分匹配）
 * @param {string} dateStr - 日期字符串（可选，如果不提供则搜索所有日期）
 * @returns {Promise<Array>} 返回匹配的待办事项数组
 */
async function findTodosByContent(content, dateStr = null) {
  try {
    if (!db || !db.calendarTodos) {
      return [];
    }

    let todos;
    if (dateStr) {
      // 如果指定了日期，只搜索该日期
      todos = await db.calendarTodos
        .where('date')
        .equals(dateStr)
        .toArray();
    } else {
      // 如果没有指定日期，搜索最近30天的待办事项
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);

      const startDate = formatDate(thirtyDaysAgo);
      const endDate = formatDate(today);

      todos = await db.calendarTodos
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray();
    }

    // 根据内容匹配（支持部分匹配）
    const contentLower = content.toLowerCase().trim();
    return todos.filter(todo => {
      const todoContentLower = todo.content.toLowerCase();
      return todoContentLower.includes(contentLower) || contentLower.includes(todoContentLower);
    });
  } catch (error) {
    console.warn('查找待办事项失败:', error);
    return [];
  }
}

/**
 * 格式化日历数据为文本，用于发送给AI
 * @param {Array} events - 行程数组
 * @param {Array} todos - 待办事项数组
 * @param {string} dateStr - 日期字符串
 * @returns {string} 格式化后的文本
 */
function formatCalendarDataForAI(events, todos, dateStr) {
  const dateObj = new Date(dateStr);
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const dateText = `${month}月${day}日`;

  let text = `【${dateText}的日程安排】\n\n`;

  if (events.length > 0) {
    text += `📅 行程安排：\n`;
    events.forEach(event => {
      const startTime = event.startTime || event.time || '';
      const endTime = event.endTime || '';
      if (endTime) {
        text += `  • ${startTime} - ${endTime} ${event.content}\n`;
      } else {
        text += `  • ${startTime} ${event.content}\n`;
      }
    });
    text += '\n';
  } else {
    text += `📅 行程安排：暂无\n\n`;
  }

  if (todos.length > 0) {
    text += `✅ 待办事项：\n`;
    todos.forEach(todo => {
      const status = todo.completed ? '✓' : '○';
      text += `  ${status} ${todo.content}\n`;
    });
  } else {
    text += `✅ 待办事项：暂无\n`;
  }

  return text;
}

/**
 * 获取指定日期的月经记录
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD)
 * @returns {Promise<Object|null>} 返回月经记录对象，包含 date, flow, pain，如果没有则返回null
 */
async function getPeriodDataForDate(dateStr) {
  try {
    if (!db || !db.calendarPeriods) {
      return null;
    }
    const period = await db.calendarPeriods.where('date').equals(dateStr).first();
    return period || null;
  } catch (error) {
    console.warn('读取月经记录失败:', error);
    return null;
  }
}

/**
 * 获取今日的月经记录
 * @returns {Promise<Object|null>} 返回今日的月经记录
 */
async function getTodayPeriodData() {
  const today = formatDate(new Date());
  return await getPeriodDataForDate(today);
}

/**
 * 获取当前月经周期的持续天数（从最近一次月经开始到今天的连续天数）
 * @returns {Promise<number>} 返回持续天数，如果没有月经记录则返回0
 */
async function getCurrentPeriodDuration() {
  try {
    if (!db || !db.calendarPeriods) {
      return 0;
    }

    const today = new Date();
    const todayStr = formatDate(today);

    // 检查今天是否有月经记录
    const todayPeriod = await getPeriodDataForDate(todayStr);
    if (!todayPeriod) {
      return 0;
    }

    // 从今天往前查找连续的天数
    let duration = 0;
    let currentDate = new Date(today);

    while (true) {
      const dateStr = formatDate(currentDate);
      const period = await getPeriodDataForDate(dateStr);
      if (period) {
        duration++;
        // 往前一天
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }

    return duration;
  } catch (error) {
    console.warn('计算月经周期持续天数失败:', error);
    return 0;
  }
}

/**
 * 格式化月经数据为AI上下文文本
 * @param {Object} periodData - 月经记录对象，包含 flow 和 pain
 * @param {number} duration - 当前月经周期持续天数
 * @returns {string} 格式化后的文本
 */
function formatPeriodDataForAI(periodData, duration = 0) {
  if (!periodData) {
    return '';
  }

  const flowMap = {
    'light': '少',
    'medium': '中',
    'heavy': '大'
  };

  const painMap = {
    'none': '不痛',
    'mild': '痛',
    'severe': '非常痛'
  };

  const flowText = flowMap[periodData.flow] || periodData.flow;
  const painText = painMap[periodData.pain] || periodData.pain;

  let text = `\n【用户当前月经状态】\n`;
  text += `- 经量：${flowText}\n`;
  text += `- 疼痛程度：${painText}\n`;
  if (duration > 0) {
    text += `- 当前周期已持续：${duration}天\n`;
  }

  return text;
}

/**
 * 判断月经状态是否需要AI主动关心
 * @param {Object} periodData - 月经记录对象
 * @returns {boolean} 如果需要主动关心返回true
 */
function shouldActivelyCareAboutPeriod(periodData) {
  if (!periodData) {
    return false;
  }

  // 如果量是大且疼痛是非常痛，必须主动关心
  if (periodData.flow === 'heavy' && periodData.pain === 'severe') {
    return true;
  }

  return false;
}

/**
 * 判断月经状态是否需要AI提及（普通情况）
 * @param {Object} periodData - 月经记录对象
 * @param {number} duration - 当前月经周期持续天数
 * @returns {boolean} 如果需要提及返回true
 */
function shouldMentionPeriod(periodData, duration) {
  if (!periodData) {
    return false;
  }

  // 如果持续时间异常（超过7天），需要提及
  if (duration > 7) {
    return true;
  }

  // 如果量是大或疼痛是非常痛，需要提及
  if (periodData.flow === 'heavy' || periodData.pain === 'severe') {
    return true;
  }

  return false;
}

// 确保函数在全局作用域中可用（用于index.html中的调用）
if (typeof window !== 'undefined') {
  window.getPeriodDataForDate = getPeriodDataForDate;
  window.getTodayPeriodData = getTodayPeriodData;
  window.getCurrentPeriodDuration = getCurrentPeriodDuration;
  window.formatPeriodDataForAI = formatPeriodDataForAI;
  window.shouldActivelyCareAboutPeriod = shouldActivelyCareAboutPeriod;
  window.shouldMentionPeriod = shouldMentionPeriod;
}

let editingCategoryId = null;

/**
 * 打开分类管理模态框
 */
async function openCategoriesModal() {
  const modal = document.getElementById('calendar-categories-modal');
  modal.classList.add('visible');
  await loadCategoriesList();
}

/**
 * 关闭分类管理模态框
 */
function closeCategoriesModal() {
  document.getElementById('calendar-categories-modal').classList.remove('visible');
}

/**
 * 加载分类列表到管理界面
 */
async function loadCategoriesList() {
  try {
    if (!db || !db.calendarCategories) return;

    const categories = await db.calendarCategories.toArray();
    const categoriesList = document.getElementById('calendar-categories-list');
    if (!categoriesList) return;

    categoriesList.innerHTML = '';

    if (categories.length === 0) {
      categoriesList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">暂无分类</p>';
      return;
    }

    categories.forEach(category => {
      const categoryItem = document.createElement('div');
      categoryItem.style.display = 'flex';
      categoryItem.style.alignItems = 'center';
      categoryItem.style.gap = '10px';
      categoryItem.style.padding = '12px';
      categoryItem.style.borderRadius = '8px';
      categoryItem.style.backgroundColor = 'var(--secondary-bg)';
      categoryItem.style.border = '1px solid var(--border-color)';

      const colorBox = document.createElement('div');
      colorBox.style.width = '24px';
      colorBox.style.height = '24px';
      colorBox.style.borderRadius = '4px';
      colorBox.style.backgroundColor = category.color || '#4CAF50';
      colorBox.style.border = '1px solid var(--border-color)';

      const nameDiv = document.createElement('div');
      nameDiv.style.flex = '1';
      nameDiv.style.fontSize = '14px';
      nameDiv.style.color = 'var(--text-primary)';
      nameDiv.textContent = category.name;

      const editBtn = document.createElement('button');
      editBtn.className = 'moe-btn';
      editBtn.style.padding = '4px 8px';
      editBtn.style.fontSize = '12px';
      editBtn.textContent = '编辑';
      editBtn.addEventListener('click', () => openCategoryEditModal(category));

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'moe-btn form-button-secondary';
      deleteBtn.style.padding = '4px 8px';
      deleteBtn.style.fontSize = '12px';
      deleteBtn.textContent = '删除';
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`确定要删除分类"${category.name}"吗？`)) {
          await db.calendarCategories.delete(category.id);
          await loadCategoriesList();
          await loadCategories(); // 更新下拉框
          await renderCalendar(currentCalendarDate); // 刷新日历显示
        }
      });

      categoryItem.appendChild(colorBox);
      categoryItem.appendChild(nameDiv);
      categoryItem.appendChild(editBtn);
      categoryItem.appendChild(deleteBtn);

      categoriesList.appendChild(categoryItem);
    });
  } catch (error) {
    console.warn('加载分类列表失败:', error);
  }
}

/**
 * 打开添加/编辑分类模态框
 */
function openCategoryEditModal(category = null) {
  editingCategoryId = category ? category.id : null;
  const modal = document.getElementById('calendar-category-edit-modal');
  modal.classList.add('visible');

  const title = document.getElementById('calendar-category-edit-title');
  const nameInput = document.getElementById('calendar-category-name');
  const colorInput = document.getElementById('calendar-category-color');

  if (category) {
    title.textContent = '编辑分类';
    nameInput.value = category.name;
    colorInput.value = category.color || '#4CAF50';
  } else {
    title.textContent = '添加分类';
    nameInput.value = '';
    colorInput.value = '#4CAF50';
  }
}

/**
 * 关闭添加/编辑分类模态框
 */
function closeCategoryEditModal() {
  document.getElementById('calendar-category-edit-modal').classList.remove('visible');
  editingCategoryId = null;
}

/**
 * 保存分类
 */
async function saveCategory() {
  const name = document.getElementById('calendar-category-name').value.trim();
  const color = document.getElementById('calendar-category-color').value;

  if (!name) {
    alert('请输入分类名称');
    return;
  }

  try {
    if (editingCategoryId) {
      // 编辑模式
      await db.calendarCategories.update(editingCategoryId, { name, color });
      alert('分类已更新！');
    } else {
      // 新建模式
      await db.calendarCategories.add({ name, color });
      alert('分类已添加！');
    }

    closeCategoryEditModal();
    await loadCategoriesList();
    await loadCategories(); // 更新下拉框
    await renderCalendar(currentCalendarDate); // 刷新日历显示
  } catch (error) {
    console.error('保存分类失败:', error);
    alert('保存分类失败，请重试');
  }
}

/**
 * 打开添加/编辑月经记录模态框 (从菜单进入，支持日期范围)
 */
async function openAddPeriodModal() {
  const modal = document.getElementById('calendar-add-period-modal');
  modal.classList.add('visible');

  const startDateInput = document.getElementById('calendar-period-start-date');
  const endDateInput = document.getElementById('calendar-period-end-date');

  // 移除日期限制，允许选择任意日期
  startDateInput.removeAttribute('min');
  startDateInput.removeAttribute('max');
  endDateInput.removeAttribute('min');
  endDateInput.removeAttribute('max');

  // 关键修改：强制显示日期选择区域（因为单日模式可能会将其隐藏）
  const dateRangeGroup = startDateInput.closest('.form-group');
  if (dateRangeGroup) {
    dateRangeGroup.style.display = 'block';
  }

  // 设置默认日期为选中的日期，如果没有选中则使用今天
  const today = formatDate(new Date());
  const defaultDate = selectedDate || today;

  startDateInput.value = defaultDate;
  endDateInput.value = '';

  // 初始化日期列表（先执行一次，确保数据是最新的）
  await updatePeriodDatesList();

  // 添加日期变化监听器
  const startHandler = () => updatePeriodDatesList();
  const endHandler = () => updatePeriodDatesList();
  startDateInput.onchange = startHandler; // 使用onchange属性防止重复绑定
  endDateInput.onchange = endHandler;

  // 更新标题
  const title = document.getElementById('calendar-period-modal-title');
  if (title) title.textContent = '添加/编辑月经记录';
}

/**
 * 更新月经记录日期列表
 */
async function updatePeriodDatesList() {
  const startDate = document.getElementById('calendar-period-start-date').value;
  const endDate = document.getElementById('calendar-period-end-date').value;
  const datesList = document.getElementById('calendar-period-dates-list');

  if (!startDate) {
    datesList.innerHTML = '';
    return;
  }

  // 生成日期范围
  const dates = [];
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date(startDate);

  if (end < start) {
    datesList.innerHTML = '<p style="color: red; font-size: 12px;">结束日期不能早于开始日期</p>';
    return;
  }

  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDate(new Date(current)));
    current.setDate(current.getDate() + 1);
  }

  // 清空列表
  datesList.innerHTML = '';

  // 为每个日期创建输入项
  for (const date of dates) {
    // 获取已有记录
    let existingRecord = null;
    try {
      if (db && db.calendarPeriods) {
        existingRecord = await db.calendarPeriods.where('date').equals(date).first();
      }
    } catch (error) {
      console.warn('查询月经记录失败:', error);
    }

    const dateItem = document.createElement('div');
    dateItem.style.padding = '12px';
    dateItem.style.borderRadius = '8px';
    dateItem.style.backgroundColor = 'var(--secondary-bg)';
    dateItem.style.border = '1px solid var(--border-color)';
    dateItem.style.display = 'flex';
    dateItem.style.flexDirection = 'column';
    dateItem.style.gap = '10px';

    const dateLabel = document.createElement('div');
    dateLabel.style.fontSize = '14px';
    dateLabel.style.fontWeight = '600';
    dateLabel.style.color = 'var(--text-primary)';
    const dateObj = new Date(date);
    dateLabel.textContent = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
    dateItem.appendChild(dateLabel);

    const controlsRow = document.createElement('div');
    controlsRow.style.display = 'flex';
    controlsRow.style.gap = '10px';

    const flowGroup = document.createElement('div');
    flowGroup.style.flex = '1';
    const flowLabel = document.createElement('label');
    flowLabel.textContent = '经量';
    flowLabel.style.fontSize = '12px';
    flowLabel.style.color = 'var(--text-secondary)';
    flowLabel.style.marginBottom = '4px';
    flowLabel.style.display = 'block';
    const flowSelect = document.createElement('select');
    flowSelect.className = 'moe-input';
    flowSelect.setAttribute('data-date', date);
    flowSelect.setAttribute('data-type', 'flow');
    flowSelect.innerHTML = `
      <option value="light">少</option>
      <option value="medium">中</option>
      <option value="heavy">大</option>
    `;
    if (existingRecord) {
      flowSelect.value = existingRecord.flow || 'medium';
    } else {
      flowSelect.value = 'medium';
    }
    flowGroup.appendChild(flowLabel);
    flowGroup.appendChild(flowSelect);

    const painGroup = document.createElement('div');
    painGroup.style.flex = '1';
    const painLabel = document.createElement('label');
    painLabel.textContent = '疼痛';
    painLabel.style.fontSize = '12px';
    painLabel.style.color = 'var(--text-secondary)';
    painLabel.style.marginBottom = '4px';
    painLabel.style.display = 'block';
    const painSelect = document.createElement('select');
    painSelect.className = 'moe-input';
    painSelect.setAttribute('data-date', date);
    painSelect.setAttribute('data-type', 'pain');
    painSelect.innerHTML = `
      <option value="none">不痛</option>
      <option value="mild">痛</option>
      <option value="severe">非常痛</option>
    `;
    if (existingRecord) {
      painSelect.value = existingRecord.pain || 'none';
    } else {
      painSelect.value = 'none';
    }
    painGroup.appendChild(painLabel);
    painGroup.appendChild(painSelect);

    controlsRow.appendChild(flowGroup);
    controlsRow.appendChild(painGroup);
    dateItem.appendChild(controlsRow);

    datesList.appendChild(dateItem);
  }
}

/**
 * 关闭添加月经记录模态框
 */
function closeAddPeriodModal() {
  const modal = document.getElementById('calendar-add-period-modal');
  modal.classList.remove('visible');

  // 恢复日期范围选择区域的显示（默认状态，下次从气泡打开时应该显示）
  const startDateInput = document.getElementById('calendar-period-start-date');
  if (startDateInput) {
    const dateRangeGroup = startDateInput.closest('.form-group');
    if (dateRangeGroup) {
      dateRangeGroup.style.display = 'block';
    }
  }
}

/**
 * 保存月经记录
 */
async function savePeriod() {
  const startDate = document.getElementById('calendar-period-start-date').value;
  const endDate = document.getElementById('calendar-period-end-date').value;

  if (!startDate) {
    alert('请选择开始日期');
    return;
  }

  try {
    // 获取所有日期输入项
    const dateItems = document.querySelectorAll('#calendar-period-dates-list > div');
    let savedCount = 0;

    // 保存每个日期的记录
    for (const item of dateItems) {
      const flowSelect = item.querySelector('select[data-type="flow"]');
      const painSelect = item.querySelector('select[data-type="pain"]');

      if (!flowSelect || !painSelect) continue;

      const date = flowSelect.getAttribute('data-date');
      const flow = flowSelect.value;
      const pain = painSelect.value;

      // 保存或更新记录（移除月份限制）
      const existing = await db.calendarPeriods.where('date').equals(date).first();
      if (existing) {
        await db.calendarPeriods.update(existing.id, { flow, pain });
      } else {
        await db.calendarPeriods.add({ date, flow, pain });
      }
      savedCount++;
    }

    closeAddPeriodModal();
    alert(`已保存${savedCount}天的月经记录！`);

    // 刷新日历显示
    await renderCalendar(currentCalendarDate);

    // 如果当前选中的日期在范围内，重新加载信息
    if (selectedDate) {
      await loadDayInfo(selectedDate);
    }
  } catch (error) {
    console.error('保存月经记录失败:', error);
    alert('保存月经记录失败，请重试');
  }
}

/**
 * 打开编辑单个日期的月经记录模态框
 */
async function openEditPeriodDateModal(dateStr) {
  // 获取该日期的记录
  let existingRecord = null;
  try {
    if (db && db.calendarPeriods) {
      existingRecord = await db.calendarPeriods.where('date').equals(dateStr).first();
    }
  } catch (error) {
    console.warn('查询月经记录失败:', error);
  }

  // 如果有记录，显示选择菜单（编辑/删除）
  if (existingRecord) {
    const options = [
      { text: '编辑经量和疼痛', value: 'edit' },
      { text: '取消月经记录', value: 'delete' }
    ];

    showChoiceModal('选择操作', options).then(async (choice) => {
      if (choice === 'edit') {
        openSingleDatePeriodEditor(dateStr, '编辑月经记录');
      } else if (choice === 'delete') {
        if (confirm('确定要删除这天的月经记录吗？')) {
          try {
            await db.calendarPeriods.delete(existingRecord.id);
            alert('已删除月经记录！');
            await renderCalendar(currentCalendarDate);
            if (selectedDate === dateStr) {
              await loadDayInfo(selectedDate);
            }
          } catch (error) {
            console.error('删除月经记录失败:', error);
            alert('删除失败，请重试');
          }
        }
      }
    });
  } else {
    // 如果没有记录，直接打开编辑界面
    openSingleDatePeriodEditor(dateStr, '添加月经记录');
  }
}

/**
 * 辅助函数：打开单日编辑界面（隐藏日期选择器）
 */
async function openSingleDatePeriodEditor(dateStr, titleText) {
  const modal = document.getElementById('calendar-add-period-modal');
  modal.classList.add('visible');

  const startDateInput = document.getElementById('calendar-period-start-date');
  const endDateInput = document.getElementById('calendar-period-end-date');

  // 设置为同一天
  startDateInput.value = dateStr;
  endDateInput.value = dateStr;

  // 关键修改：隐藏日期选择区域（输入框和提示文字）
  const dateRangeGroup = startDateInput.closest('.form-group');
  if (dateRangeGroup) {
    dateRangeGroup.style.display = 'none';
  }

  // 立即生成单日的选项列表
  await updatePeriodDatesList();

  // 更新标题
  const title = document.getElementById('calendar-period-modal-title');
  if (title) {
    // 格式化日期用于标题，例如 "1月5日的记录"
    const dateObj = new Date(dateStr);
    const dateText = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
    title.textContent = `${dateText} ${titleText.replace('添加/编辑', '')}`;
  }
}