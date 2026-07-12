ObjC.import('Foundation');

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function run() {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;

  const bundlePath = ObjC.unwrap($.NSBundle.mainBundle.bundlePath);
  const dmgRoot = bundlePath.replace(/\/[^/]+$/, '');
  const resourcesDirectory = `${dmgRoot}/.TimeWhereInstaller`;
  const terminalInstaller = `${resourcesDirectory}/install-mac-internal-terminal.command`;

  try {
    app.displayDialog(
      '将安装 TimeWhere，并把内部代码签名证书设为本机系统级信任。\n\n' +
        '仅适用于管理员批准的内部 Mac。继续后会打开 Terminal，' +
        '请在其中输入一次管理员密码。',
      {
        buttons: ['取消', '安装'],
        defaultButton: '安装',
        cancelButton: '取消',
        withTitle: 'TimeWhere 内部安装器'
      }
    );

    app.doShellScript('/usr/bin/killall TimeWhere >/dev/null 2>&1 || true');
    delay(2);

    app.doShellScript(`/usr/bin/open -a Terminal ${shellQuote(terminalInstaller)}`);

    app.displayDialog('Terminal 已打开。请在 Terminal 中输入管理员密码并按 Return。', {
      buttons: ['好'],
      defaultButton: '好',
      withTitle: '继续安装 TimeWhere'
    });
  } catch (error) {
    if (Number(error.errorNumber) !== -128) {
      app.displayDialog(`安装未完成：\n\n${String(error.message || error)}`, {
        buttons: ['好'],
        defaultButton: '好',
        withTitle: 'TimeWhere 安装失败'
      });
    }
  }
}
