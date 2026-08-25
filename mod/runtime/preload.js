(() => {
  const assistant = window.dolQuestAssistant;
  if (!assistant) {
    console.error("[DoLQuestAssistant] 主程序未能加载，任务入口无法创建。");
    return;
  }

  const attach = () => {
    try {
      assistant.attach();
    } catch (error) {
      console.error("[DoLQuestAssistant] 游戏内入口创建失败：", error);
    }
  };

  if (typeof window.jQuery === "function") {
    window.jQuery(document).one(":storyready", attach);
  } else {
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  }

  if (window.V || window.State?.variables || window.SugarCube?.State?.variables) {
    attach();
  }
})();
