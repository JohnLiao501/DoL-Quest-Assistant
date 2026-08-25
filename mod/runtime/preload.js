(() => {
  const assistant = window.dolQuestAssistant;
  if (!assistant) {
    console.error("[DoLQuestAssistant] 主程序未能加载，任务入口无法创建。");
  }
})();
