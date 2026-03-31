export const buildReplayViewerHtml = (sessionData: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Session Replay</title>
  <script src="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/index.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/style.css">
  <style>
    body { margin: 0; padding: 0; background: #1a1a2e; color: #eee; font-family: system-ui; }
    #replay { width: 100vw; height: 100vh; }
    .header { padding: 12px 24px; background: #16213e; border-bottom: 1px solid #0f3460; }
    h1 { margin: 0; font-size: 16px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="header"><h1>Session Replay</h1></div>
  <div id="replay"></div>
  <script>
    const events = ${sessionData};
    new rrwebPlayer({
      target: document.getElementById('replay'),
      props: { events, width: '100%', height: 'calc(100vh - 49px)' }
    });
  </script>
</body>
</html>`;
