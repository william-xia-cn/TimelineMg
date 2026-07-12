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
  const rootInstaller = `${resourcesDirectory}/install-mac-internal-root.sh`;

  try {
    app.displayDialog(
      '将安装 TimeWhere，并把内部代码签名证书设为本机系统级信任。\n\n' +
        '仅适用于管理员批准的内部 Mac。继续时需要输入一次管理员密码。',
      {
        buttons: ['取消', '安装'],
        defaultButton: '安装',
        cancelButton: '取消',
        withTitle: 'TimeWhere 内部安装器'
      }
    );

    app.doShellScript('/usr/bin/killall TimeWhere >/dev/null 2>&1 || true');
    delay(2);

    const installCommand = `${shellQuote(rootInstaller)} ${shellQuote(resourcesDirectory)}`;
    const result = app.doShellScript(installCommand, { administratorPrivileges: true });

    app.displayDialog(result, {
      buttons: ['完成'],
      defaultButton: '完成',
      withTitle: 'TimeWhere 安装成功'
    });
    app.doShellScript(`/usr/bin/open -a ${shellQuote('/Applications/TimeWhere.app')}`);
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
