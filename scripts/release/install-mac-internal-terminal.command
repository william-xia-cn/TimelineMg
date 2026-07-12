#!/usr/bin/env bash
set -u

resources_dir="$(cd "$(dirname "$0")" && pwd)"
root_installer="$resources_dir/install-mac-internal-root.sh"

echo "TimeWhere 内部安装器"
echo "===================="
echo "请输入这台 Mac 的管理员密码。输入时屏幕不会显示字符。"
echo

/usr/bin/sudo -- "$root_installer" "$resources_dir"
install_status=$?

echo
if [[ "$install_status" -eq 0 ]]; then
  /usr/bin/open -a /Applications/TimeWhere.app
  echo "TimeWhere 安装完成，应用已启动。"
else
  echo "TimeWhere 安装失败，请保留上方错误信息。"
fi

echo
read -r -p "按 Return 关闭此窗口…" _
exit "$install_status"
