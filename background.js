// Background service worker for Focus Flow
// Handles alarms so the timer works even when popup is closed

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pomodoroTick') {
    chrome.storage.local.get(['timerState'], (result) => {
      const state = result.timerState;
      if (!state || !state.running) return;

      const now = Date.now();
      const elapsed = Math.floor((now - state.startedAt) / 1000);
      const remaining = state.totalSeconds - elapsed;

      if (remaining <= 0) {
        // Timer finished — switch phase
        const nextPhase = state.phase === 'work' ? 'break' : 'work';
        const nextDuration = nextPhase === 'work' ? state.workMins : state.breakMins;

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Focus Flow',
          message: nextPhase === 'break'
            ? '🎉 Work session done! Time for a break.'
            : '⚡ Break over! Back to work.',
          priority: 2
        });

        chrome.storage.local.set({
          timerState: {
            ...state,
            phase: nextPhase,
            totalSeconds: nextDuration * 60,
            startedAt: Date.now(),
            running: false,
            remaining: nextDuration * 60
          }
        });

        chrome.alarms.clear('pomodoroTick');
      } else {
        chrome.storage.local.set({
          timerState: { ...state, remaining }
        });
      }
    });
  }
});
