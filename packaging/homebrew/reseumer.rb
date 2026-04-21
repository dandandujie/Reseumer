# Homebrew Cask for Reseumer
#
# 使用方式：
#   1. 新建一个 tap 仓库，名字形如 `homebrew-reseumer`（GitHub repo 必须以 `homebrew-` 前缀）。
#   2. 把本文件放到 tap 仓库的 `Casks/reseumer.rb`。
#   3. 每次发 release 后，更新下面的 `version` 和 `sha256`：
#        shasum -a 256 Reseumer_<version>_aarch64.dmg
#   4. 用户安装：
#        brew tap dandandujie/reseumer
#        brew install --cask reseumer
#
# Homebrew 安装后会自动清除 quarantine，用户无需再跑 `xattr -cr`。

cask "reseumer" do
  version "0.4.0"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/dandandujie/Reseumer/releases/download/v#{version}/Reseumer_#{version}_aarch64.dmg"
  name "Reseumer"
  desc "AI-powered resume builder"
  homepage "https://github.com/dandandujie/Reseumer"

  depends_on arch: :arm64
  depends_on macos: ">= :big_sur"

  app "Reseumer.app"

  zap trash: [
    "~/Library/Application Support/com.reseumer.desktop",
    "~/Library/Caches/com.reseumer.desktop",
    "~/Library/Preferences/com.reseumer.desktop.plist",
    "~/Library/Saved Application State/com.reseumer.desktop.savedState",
  ]
end
