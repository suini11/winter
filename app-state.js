// app-state.js
// 全局状态和常量定义

window.state = {
  chats: {},
  activeChatId: null,
  globalSettings: {},
  apiConfig: {},
  userStickers: [],
  worldBooks: [],
  personaPresets: [],
  qzoneSettings: {},
  activeAlbumId: null,
};

const defaultAvatar = "https://i.postimg.cc/PxZrFFFL/o-o-1.jpg";
const defaultMyGroupAvatar = "https://i.postimg.cc/cLPP10Vm/4.jpg";
const defaultGroupMemberAvatar = "https://i.postimg.cc/VkQfgzGJ/1.jpg";
const defaultGroupAvatar =
  "https://i.postimg.cc/gc3QYCDy/1-NINE7-Five.jpg";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
