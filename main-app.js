// main-app.js
// 主应用初始化文件

// 确保在DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('主应用初始化中...');
  
  // 等待所有defer脚本加载完成
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 确保weibo.js中的函数已经定义后再绑定事件
  if (typeof openWeiboPublisherClean === 'function') {
    const createWeiboPostBtn = document.getElementById('create-weibo-post-btn');
    if (createWeiboPostBtn) {
      // 移除可能存在的旧事件监听器
      const newBtn = createWeiboPostBtn.cloneNode(true);
      createWeiboPostBtn.parentNode.replaceChild(newBtn, createWeiboPostBtn);
      // 重新绑定事件
      newBtn.addEventListener('click', openWeiboPublisherClean);
    }
  }
  
  console.log('主应用初始化完成');
});

