#!/usr/bin/env bash
# 无 root 环境下为 Chromium 加载本地解压的系统依赖库（存在时才注入）
LOCAL_LIBS="$HOME/.local/chromium-libs"
if [ -d "$LOCAL_LIBS" ]; then
  export LD_LIBRARY_PATH="$LOCAL_LIBS/usr/lib/aarch64-linux-gnu:$LOCAL_LIBS/lib/aarch64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
exec npx playwright test "$@"
