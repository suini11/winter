// api-handlers.js
// API 请求处理函数

/**
 * 【已修复 Gemini 直连问题】构建 Gemini API 请求数据
 * 修复内容：
 * 1. 自动合并连续的相同角色消息 (解决 context 丢失和 400 错误)
 * 2. 智能去重 System Prompt (解决重复生成和忽略用户输入)
 * 3. 确保 contents 不为空 (解决功能性 400 错误)
 */
window.toGeminiRequestData = function (
  model,
  apiKey,
  systemInstruction,
  messagesForDecision,
  isGemini,
  temperature
) {
  if (!isGemini) {
    return undefined;
  }

  let roleType = {
    user: "user",
    assistant: "model",
    system: "user", // System 消息在 Gemini 中通常作为 User 消息的一部分或 SystemInstruction
  };

  // --- 1. 预处理消息列表 ---
  let processedMessages = [...messagesForDecision];
  let finalSystemInstruction = systemInstruction;

  // 场景A：聊天模式
  // 如果消息列表很长，且最后一条消息的内容等于 System Instruction
  // 说明这是 triggerAiResponse 自动追加的，我们需要把它移除，防止重复和覆盖用户输入
  if (finalSystemInstruction && processedMessages.length > 1) {
    const lastMsg = processedMessages[processedMessages.length - 1];
    if (
      lastMsg.role === "system" &&
      lastMsg.content === finalSystemInstruction
    ) {
      processedMessages.pop();
    }
  }
  // 场景B：功能生成模式 (如查手机、生成图片描述)
  // 这种情况下 messagesForDecision 通常只包含一条与 System Instruction 相同的消息
  // 为了避免 contents 为空 (导致400)，我们清空 systemInstruction 字段，让这条消息作为唯一的 User 消息发送
  else if (processedMessages.length === 1 && finalSystemInstruction) {
    if (processedMessages[0].content === finalSystemInstruction) {
      finalSystemInstruction = ""; // 清空系统指令，依靠 contents 里的消息
    }
  }

  // --- 2. 构建 contents 数组 (核心：合并连续角色) ---
  const contents = [];
  let currentTurn = null;

  processedMessages.forEach((item) => {
    const targetRole = roleType[item.role] || "user";

    // 处理消息内容，兼容多模态 (图片) 和纯文本
    let parts = [];
    if (Array.isArray(item.content)) {
      // 检查是否包含图片
      const hasImage = item.content.some(
        (sub) => sub.type === "image_url"
      );
      if (hasImage) {
        parts = isImage(item.content[0], item.content[1]);
      } else {
        // 纯文本数组转字符串
        parts = [{ text: JSON.stringify(item.content) }];
      }
    } else {
      // 普通字符串
      const textVal = String(item.content || "");
      if (textVal.trim() === "") return; // 跳过空消息
      parts = [{ text: textVal }];
    }

    if (parts.length === 0) return;

    // 【关键逻辑】如果当前消息角色与上一条相同，则合并到上一条的 parts 中
    // 这让 Gemini 能够同时看到 [用户输入] 和 [系统补充的Context]，而不会把它们当成两轮对话
    if (currentTurn && currentTurn.role === targetRole) {
      currentTurn.parts.push(...parts);
    } else {
      // 否则，开始新的一轮
      if (currentTurn) contents.push(currentTurn);
      currentTurn = {
        role: targetRole,
        parts: [...parts],
      };
    }
  });

  // 推入最后一轮
  if (currentTurn) contents.push(currentTurn);

  // --- 3. 最后的兜底检查 ---
  // Gemini 要求 contents 不能为空。如果经过过滤后为空，必须补救。
  if (contents.length === 0) {
    if (finalSystemInstruction) {
      // 如果有系统指令，就把它挪到 contents 里作为 User 消息
      contents.push({
        role: "user",
        parts: [{ text: finalSystemInstruction }],
      });
      finalSystemInstruction = ""; // 避免重复
    } else {
      // 实在没东西发了，发个空格防止报错 (极罕见情况)
      contents.push({ role: "user", parts: [{ text: " " }] });
    }
  }

  // --- 4. 组装请求体 ---
  const body = {
    contents: contents,
    generationConfig: {
      temperature: parseFloat(temperature) || 0.8,
    },
  };

  // 只有当 systemInstruction 不为空时才添加该字段
  if (finalSystemInstruction && finalSystemInstruction.trim()) {
    body.systemInstruction = {
      parts: [{ text: finalSystemInstruction }],
    };
  }

  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${getRandomValue(
      apiKey
    )}`,
    data: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  };
};
