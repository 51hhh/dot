#!/usr/bin/env bash
# Zsh 一键配置：独立、幂等、无需 TMUX.sh 或 dot.sh。

set -uo pipefail

if ((BASH_VERSINFO[0] < 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 2))); then
  printf '需要 bash >= 4.2\n' >&2
  exit 1
fi

readonly REPO_GITHUB="https://github.com"
readonly REPO_GITEE="https://gitee.com"
readonly RULE="────────────────────────────────────────────────────────────"
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RED=$'\033[0;31m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
NC=$'\033[0m'

log_info() { printf '%b[i]%b %s\n' "$CYAN" "$NC" "$*"; }
log_ok() { printf '%b[+]%b %s\n' "$GREEN" "$NC" "$*"; }
log_warn() { printf '%b[!]%b %s\n' "$YELLOW" "$NC" "$*" >&2; }
log_error() { printf '%b[x]%b %s\n' "$RED" "$NC" "$*" >&2; }

declare -gA ANS=()
PLAN=()
ONLY=()
YES=0
DRY_RUN=0
PRESET=""
TTY_FD=""
UI_FD=2

ans() { printf '%s' "${ANS[$1]:-}"; }
has_word() { [[ " $1 " == *" $2 "* ]]; }
selected() {
  local id="$1" wanted
  ((${#ONLY[@]} == 0)) && return 0
  for wanted in "${ONLY[@]}"; do [[ "$wanted" == "$id" ]] && return 0; done
  return 1
}

need_arg() {
  (($2 >= 2)) && return 0
  log_error "$1 后面缺少参数"
  exit 2
}

open_tty() {
  if [[ -n "${DOT_INPUT_FD:-}" ]]; then
    [[ "$DOT_INPUT_FD" =~ ^[0-9]+$ ]] || {
      log_error "DOT_INPUT_FD 必须是数字"
      return 1
    }
    TTY_FD="$DOT_INPUT_FD"
    UI_FD=2
  else
    exec 9<>/dev/tty 2>/dev/null || {
      log_error "交互模式需要终端；自动化请使用 --preset recommended --yes"
      return 1
    }
    TTY_FD=9
    UI_FD=9
  fi
}

read_key() {
  local key rest=""
  IFS= read -rsn1 -u "$TTY_FD" key || return 1
  [[ "$key" == $'\r' ]] && key=""
  if [[ "$key" == $'\033' ]]; then
    IFS= read -rsn2 -t 0.05 -u "$TTY_FD" rest || true
    key+="$rest"
  fi
  printf '%s' "$key"
}

valid_one() {
  local key="$1" value="$2" allowed="$3"
  [[ -n "$value" ]] && has_word "$allowed" "$value" && return 0
  log_error "$key 的值无效：${value:-<空>}；可用值：$allowed"
  return 1
}

set_answer() {
  local pair="$1" key value
  [[ "$pair" == *=* ]] || {
    log_error "--set 需要 key=value：$pair"
    return 1
  }
  key="${pair%%=*}"
  value="${pair#*=}"
  case "$key" in
    zsh.profile) valid_one "$key" "$value" "recommended custom uninstall" ;;
    zsh.install) valid_one "$key" "$value" "package skip" ;;
    zsh.ohmyzsh) valid_one "$key" "$value" "install skip" ;;
    zsh.theme) valid_one "$key" "$value" "powerlevel10k skip" ;;
    zsh.font) valid_one "$key" "$value" "meslo skip" ;;
    zsh.default_shell) valid_one "$key" "$value" "yes no" ;;
    zsh.plugins)
      local p
      for p in $value; do
        has_word "git zsh-autosuggestions z extract zsh-syntax-highlighting" "$p" || {
          log_error "zsh.plugins 包含未知值：$p"
          return 1
        }
      done
      ;;
    *)
      log_error "未知答案 key：$key"
      return 1
      ;;
  esac || return 1
  ANS["$key"]="$value"
}

apply_recommended() {
  [[ -n "${ANS["zsh.install"]+x}" ]] || ANS["zsh.install"]=package
  [[ -n "${ANS["zsh.ohmyzsh"]+x}" ]] || ANS["zsh.ohmyzsh"]=install
  [[ -n "${ANS["zsh.theme"]+x}" ]] || ANS["zsh.theme"]=powerlevel10k
  [[ -n "${ANS["zsh.font"]+x}" ]] || ANS["zsh.font"]=meslo
  # zsh-syntax-highlighting 官方要求最后加载，因此固定排在列表末尾。
  [[ -n "${ANS["zsh.plugins"]+x}" ]] || ANS["zsh.plugins"]="git zsh-autosuggestions z extract zsh-syntax-highlighting"
  [[ -n "${ANS["zsh.default_shell"]+x}" ]] || ANS["zsh.default_shell"]=yes
}

ask_one() {
  local key="$1" prompt="$2" default="$3"
  shift 3
  local opts=("$@") item value label input index=0 i
  for i in "${!opts[@]}"; do [[ "${opts[$i]%%:*}" == "$default" ]] && index="$i"; done
  while :; do
    printf '\033[2J\033[H%bZsh 一键配置%b\n%s\n\n%b%s%b\n\n' "$BOLD" "$NC" "$RULE" "$BOLD" "$prompt" "$NC" >&"$UI_FD"
    for i in "${!opts[@]}"; do
      item="${opts[$i]}"
      value="${item%%:*}"
      label="${item#*:}"
      if ((i == index)); then printf '  %b❯ %-20s%b %s\n' "$CYAN" "$value" "$NC" "$label" >&"$UI_FD"; else printf '    %-20s %s\n' "$value" "$label" >&"$UI_FD"; fi
    done
    printf '\n  ↑/↓ 或 j/k 移动 · Enter 确认\n' >&"$UI_FD"
    input="$(read_key)" || return 1
    case "$input" in
      $'\033[A' | k) ((index > 0)) && index=$((index - 1)) ;;
      $'\033[B' | j) ((index + 1 < ${#opts[@]})) && index=$((index + 1)) ;;
      "")
        ANS["$key"]="${opts[$index]%%:*}"
        return 0
        ;;
    esac
  done
}

ask_many() {
  local opts=(git zsh-autosuggestions z extract zsh-syntax-highlighting) chosen=(1 1 1 1 1) index=0 input i result="" mark pointer
  while :; do
    printf '\033[2J\033[H%bZsh 一键配置%b\n%s\n\n%b插件%b\n\n' "$BOLD" "$NC" "$RULE" "$BOLD" "$NC" >&"$UI_FD"
    for i in "${!opts[@]}"; do
      mark=" "
      pointer=" "
      ((chosen[i])) && mark="✓"
      ((i == index)) && pointer="❯"
      printf '  %b%s [%s] %-24s%b\n' "$CYAN" "$pointer" "$mark" "${opts[$i]}" "$NC" >&"$UI_FD"
    done
    printf '\n  ↑/↓ 或 j/k 移动 · Space 勾选 · Enter 确认\n' >&"$UI_FD"
    input="$(read_key)" || return 1
    case "$input" in
      $'\033[A' | k) ((index > 0)) && index=$((index - 1)) ;;
      $'\033[B' | j) ((index + 1 < ${#opts[@]})) && index=$((index + 1)) ;;
      " ") chosen[index]=$((1 - chosen[index])) ;;
      "")
        for i in "${!opts[@]}"; do ((chosen[i])) && result+="${result:+ }${opts[$i]}"; done
        ANS["zsh.plugins"]="$result"
        return 0
        ;;
    esac
  done
}

interactive_answers() {
  ask_one zsh.profile "配置方式" recommended \
    recommended:"推荐配置" custom:"逐项选择" uninstall:"卸载本脚本配置" || return 1
  case "$(ans zsh.profile)" in
    recommended) apply_recommended ;;
    uninstall) return 0 ;;
    custom)
      ask_one zsh.install "安装 zsh" package package:"包管理器安装" skip:"已安装，跳过" || return 1
      ask_one zsh.ohmyzsh "Oh My Zsh" install install:"安装/保留" skip:"已安装，跳过下载" || return 1
      ask_one zsh.theme "主题" powerlevel10k powerlevel10k:"Powerlevel10k" skip:"默认主题" || return 1
      ask_many || return 1
      ask_one zsh.font "终端字体" meslo meslo:"MesloLGS Nerd Font" skip:"已安装/跳过" || return 1
      ask_one zsh.default_shell "设为默认 shell" yes yes:"执行 chsh" no:"保持不变" || return 1
      ;;
    *) valid_one zsh.profile "$(ans zsh.profile)" "recommended custom uninstall" || return 1 ;;
  esac
}

defaults() {
  [[ -n "${ANS["zsh.profile"]+x}" ]] || ANS["zsh.profile"]=recommended
  [[ "$(ans zsh.profile)" == recommended ]] && apply_recommended
}

add_step() { selected "$1" && PLAN+=("$1|$2|$3"); }
build_plan() {
  PLAN=()
  if [[ "$(ans zsh.profile)" == uninstall ]]; then
    add_step zsh.uninstall prepare "移除 Oh My Zsh、插件和本脚本配置"
    return
  fi
  [[ "$(ans zsh.install)" == package ]] && add_step zsh.package install "通过包管理器安装 zsh"
  if [[ "$(ans zsh.ohmyzsh)" == install ]]; then
    add_step zsh.ohmyzsh install "安装 Oh My Zsh"
  else
    add_step zsh.ohmyzsh.verify install "验证已有 Oh My Zsh"
  fi
  [[ "$(ans zsh.theme)" == powerlevel10k ]] && add_step zsh.theme configure "安装 Powerlevel10k"
  has_word "$(ans zsh.plugins)" zsh-autosuggestions && add_step zsh.plugin.autosuggestions configure "安装 zsh-autosuggestions"
  has_word "$(ans zsh.plugins)" zsh-syntax-highlighting && add_step zsh.plugin.syntax_highlighting configure "安装 zsh-syntax-highlighting"
  add_step zsh.zshrc configure "生成 ~/.zshrc"
  [[ "$(ans zsh.font)" == meslo ]] && add_step zsh.font final "安装 MesloLGS Nerd Font"
  [[ "$(ans zsh.default_shell)" == yes ]] && add_step zsh.default_shell final "把 zsh 设为默认 shell"
  add_step zsh.notes final "显示后续提示"
}

dot_sudo() {
  if ((EUID == 0)); then "$@"; else sudo "$@"; fi
}

detect_pm() {
  local pm
  for pm in apt-get dnf pacman zypper; do command -v "$pm" >/dev/null 2>&1 && {
    printf '%s' "$pm"
    return
  }; done
  return 1
}

pm_install_zsh() {
  case "$1" in
    apt-get) dot_sudo apt-get update -qq && dot_sudo apt-get install -y zsh git curl ca-certificates fontconfig ;;
    dnf) dot_sudo dnf install -y zsh git curl ca-certificates fontconfig ;;
    pacman) dot_sudo pacman -Sy --needed --noconfirm zsh git curl ca-certificates fontconfig ;;
    zypper) dot_sudo zypper install -y zsh git curl ca-certificates fontconfig ;;
    *) return 1 ;;
  esac
}

clone_repo() {
  local path="$1" dest="$2" required="$3" gitee="${4:-}" url
  if [[ -d "$dest/.git" ]]; then
    [[ -f "$dest/$required" ]] || {
      log_error "仓库存在但缺少入口文件：$dest/$required"
      return 1
    }
    log_ok "已正确安装，跳过：$dest"
    return
  fi
  [[ -e "$dest" ]] && {
    log_error "目标存在但不是 Git 仓库：$dest"
    return 1
  }
  command -v git >/dev/null 2>&1 || {
    log_error "缺少 git"
    return 1
  }
  mkdir -p "$(dirname "$dest")"
  local urls=("$REPO_GITHUB/$path" "https://ghfast.top/$REPO_GITHUB/$path")
  [[ -n "$gitee" ]] && urls+=("$REPO_GITEE/$gitee")
  for url in "${urls[@]}"; do
    log_info "克隆 $url"
    if GIT_TERMINAL_PROMPT=0 git clone --depth 1 "$url" "$dest"; then
      if [[ -f "$dest/$required" ]]; then
        : >"$dest/.dot-installed-by-ZSH.sh"
        return 0
      fi
      log_warn "克隆结果缺少入口文件：$required"
    fi
    rm -rf "$dest"
  done
  log_error "所有源均克隆失败：$path"
  return 1
}

step_zsh_package() {
  local missing=() cmd
  for cmd in zsh git; do command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd"); done
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then missing+=(curl); fi
  command -v fc-cache >/dev/null 2>&1 || missing+=(fontconfig)
  if ((${#missing[@]} == 0)); then
    log_ok "zsh 与安装依赖均已存在：$(zsh --version)"
    return
  fi
  log_info "需要补齐：${missing[*]}"
  local pm
  pm="$(detect_pm)" || {
    log_error "不支持当前包管理器"
    return 1
  }
  pm_install_zsh "$pm" || return 1
  command -v zsh >/dev/null 2>&1 || {
    log_error "包管理器结束后仍找不到 zsh"
    return 1
  }
  log_ok "zsh 安装完成：$(zsh --version)"
}

step_zsh_ohmyzsh() {
  clone_repo "ohmyzsh/ohmyzsh.git" "$HOME/.oh-my-zsh" "oh-my-zsh.sh"
}

step_zsh_ohmyzsh_verify() {
  [[ -f "$HOME/.oh-my-zsh/oh-my-zsh.sh" ]] || {
    log_error "选择了跳过 Oh My Zsh，但 ~/.oh-my-zsh/oh-my-zsh.sh 不存在"
    log_error "请返回选择安装，或先自行安装 Oh My Zsh。"
    return 1
  }
  log_ok "已有 Oh My Zsh 可用"
}

step_zsh_theme() {
  clone_repo "romkatv/powerlevel10k.git" "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k" \
    "powerlevel10k.zsh-theme" "romkatv/powerlevel10k.git"
}

step_zsh_plugin_autosuggestions() {
  clone_repo "zsh-users/zsh-autosuggestions.git" "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-autosuggestions" \
    "zsh-autosuggestions.plugin.zsh"
}

step_zsh_plugin_syntax_highlighting() {
  clone_repo "zsh-users/zsh-syntax-highlighting.git" "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting" \
    "zsh-syntax-highlighting.plugin.zsh"
}

backup_file() {
  local file="$1" base bak n=1
  [[ -f "$file" ]] || return 0
  for bak in "$file".bak.*; do [[ -f "$bak" ]] && cmp -s "$file" "$bak" && {
    log_info "已有相同备份：$bak"
    return
  }; done
  base="$file.bak.$(date +%Y%m%d-%H%M%S)"
  bak="$base"
  while [[ -e "$bak" ]]; do
    bak="$base.$n"
    n=$((n + 1))
  done
  cp "$file" "$bak" || return 1
  log_info "已备份：$bak"
}

step_zsh_zshrc() {
  local file="$HOME/.zshrc" theme="robbyrussell" plugins
  plugins="$(ans zsh.plugins)"
  [[ "$(ans zsh.theme)" == powerlevel10k ]] && theme="powerlevel10k/powerlevel10k"
  [[ -f "$HOME/.oh-my-zsh/oh-my-zsh.sh" ]] || {
    log_error "找不到 ~/.oh-my-zsh/oh-my-zsh.sh"
    return 1
  }
  backup_file "$file" || {
    log_error "备份 $file 失败"
    return 1
  }
  cat >"$file" <<EOF || return 1
# Generated by ZSH.sh. Re-run ZSH.sh instead of editing generated defaults blindly.
export ZSH="\$HOME/.oh-my-zsh"
ZSH_THEME="$theme"
plugins=($plugins)
source "\$ZSH/oh-my-zsh.sh"

# Powerlevel10k 的向导会生成这个文件；不存在时安静跳过。
[[ ! -f "\$HOME/.p10k.zsh" ]] || source "\$HOME/.p10k.zsh"

# User additions can be placed below this line.
EOF
  log_ok "已生成 $file"
}

download_file() {
  local url="$1" out="$2"
  if command -v curl >/dev/null 2>&1; then curl -fsSL --retry 2 -o "$out" "$url" && return; fi
  command -v wget >/dev/null 2>&1 && wget -q -O "$out" "$url"
}

step_zsh_font() {
  local dir="${XDG_DATA_HOME:-$HOME/.local/share}/fonts/MesloLGS-NF" base name tmp stage installed=0
  local names=(MesloLGS%20NF%20Regular.ttf MesloLGS%20NF%20Bold.ttf MesloLGS%20NF%20Italic.ttf MesloLGS%20NF%20Bold%20Italic.ttf)
  [[ -s "$dir/MesloLGS NF Regular.ttf" && -s "$dir/MesloLGS NF Bold.ttf" &&
    -s "$dir/MesloLGS NF Italic.ttf" && -s "$dir/MesloLGS NF Bold Italic.ttf" ]] \
    && {
      log_ok "MesloLGS NF 已安装，跳过"
      return
    }
  stage="$(mktemp -d -t zsh-font.XXXXXX)" || return 1
  base="https://github.com/romkatv/powerlevel10k-media/raw/master"
  for name in "${names[@]}"; do
    tmp="$stage/${name//%20/ }"
    download_file "$base/$name" "$tmp" || {
      log_error "字体下载失败：$name"
      rm -rf "$stage"
      return 1
    }
    [[ -s "$tmp" ]] || {
      log_error "字体响应为空：$name"
      rm -rf "$stage"
      return 1
    }
    installed=$((installed + 1))
  done
  mkdir -p "$dir" || {
    rm -rf "$stage"
    return 1
  }
  mv "$stage"/*.ttf "$dir"/ || {
    rm -rf "$stage"
    return 1
  }
  rmdir "$stage"
  if command -v fc-cache >/dev/null 2>&1; then
    # 字体已经落盘，缓存刷新失败不该把整个安装判成失败；重启应用时仍会重新扫描。
    fc-cache -f "$dir" >/dev/null 2>&1 || log_warn "fontconfig 缓存刷新失败，请稍后执行 fc-cache -f"
  fi
  log_ok "已安装 $installed 款 MesloLGS NF：$dir"
}

step_zsh_default_shell() {
  local shell current
  shell="$(command -v zsh)" || {
    log_error "找不到 zsh，不能修改默认 shell"
    return 1
  }
  current="$(getent passwd "$(id -un)" 2>/dev/null | awk -F: '{print $7}')"
  [[ "$current" == "$shell" ]] && {
    log_ok "默认 shell 已是 $shell"
    return
  }
  chsh -s "$shell" || {
    log_warn "chsh 未成功；稍后手动执行：chsh -s $shell"
    return 1
  }
  log_ok "默认 shell 已改为 $shell（下次登录生效）"
}

ptyxis_font_hint() {
  command -v gsettings >/dev/null 2>&1 || return 0
  local keys
  keys="$(gsettings list-keys org.gnome.Ptyxis 2>/dev/null || true)"
  [[ -n "$keys" ]] || return 0
  if grep -qx font-name <<<"$keys"; then
    printf '\nPtyxis 可直接设置：\n'
    printf "  gsettings set org.gnome.Ptyxis use-system-font false\n"
    printf "  gsettings set org.gnome.Ptyxis font-name 'MesloLGS NF 12'\n"
  fi
}

step_zsh_notes() {
  printf '\n%s\n安装完成。执行以下命令进入新环境：\n\n  exec zsh\n\n' "$RULE"
  [[ "$(ans zsh.theme)" == powerlevel10k ]] && printf '首次进入会启动 Powerlevel10k 配置向导；也可运行 p10k configure。\n'
  if [[ "$(ans zsh.font)" == meslo ]]; then
    printf '终端字体请选择「MesloLGS NF」；若列表没刷新，请重启终端设置。\n'
    ptyxis_font_hint
  fi
  [[ "$(ans zsh.default_shell)" == yes ]] && printf '默认 shell 的变化会在下次登录后完全生效。\n'
  printf '恢复旧配置：从 ~/.zshrc.bak.<时间戳> 复制回 ~/.zshrc。\n'
}

remove_if_owned() {
  local target="$1"
  [[ -f "$target/.dot-installed-by-ZSH.sh" ]] || return 1
  rm -rf "$target"
}

step_zsh_uninstall() {
  local custom="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
  if ! remove_if_owned "$HOME/.oh-my-zsh"; then
    # Oh My Zsh 原本就存在时，只碰本脚本自己克隆且留有标记的组件。
    remove_if_owned "$custom/themes/powerlevel10k" || true
    remove_if_owned "$custom/plugins/zsh-autosuggestions" || true
    remove_if_owned "$custom/plugins/zsh-syntax-highlighting" || true
    [[ -d "$HOME/.oh-my-zsh" ]] && log_info "保留安装前已存在的 ~/.oh-my-zsh"
  fi
  if [[ -f "$HOME/.zshrc" ]] && grep -q '^# Generated by ZSH.sh' "$HOME/.zshrc"; then rm -f "$HOME/.zshrc"; fi
  [[ -f "$HOME/.p10k.zsh" ]] && log_info "保留用户通过向导生成的 ~/.p10k.zsh"
  log_ok "已移除本脚本拥有的 Zsh 配置（系统 zsh 软件包和备份保留）"
}

run_step() {
  local id="$1" fn="step_${1//[.-]/_}"
  "$fn"
}

run_plan() {
  local row id phase label failed=0 abort=0
  for row in "${PLAN[@]}"; do
    IFS='|' read -r id phase label <<<"$row"
    if ((abort)); then
      log_warn "已跳过：$label"
      continue
    fi
    printf '\n%b[%s]%b %s\n' "$CYAN" "$phase" "$NC" "$label"
    if run_step "$id"; then
      log_ok "$label"
    else
      log_error "$label 失败"
      failed=1
      [[ "$phase" == install ]] && abort=1
    fi
  done
  return "$failed"
}

print_plan() {
  local row id phase label n=0
  printf '%b执行计划%b\n%s\n' "$BOLD" "$NC" "$RULE"
  for row in "${PLAN[@]}"; do
    IFS='|' read -r id phase label <<<"$row"
    printf '%2d. [%-9s] %-30s %s\n' "$((++n))" "$phase" "$id" "$label"
  done
}

usage() {
  cat <<'EOF'
用法：bash ZSH.sh [选项]
  --preset recommended     推荐配置
  --set key=value          覆盖答案（可重复）
  --only step.id           只执行指定步骤（可重复）
  --dry-run                只显示计划
  --yes, -y                不再确认
  --lint                   语法/声明自检
  --help                   帮助
EOF
}

lint_script() {
  local row id fn bad=0
  defaults
  build_plan
  for row in "${PLAN[@]}"; do
    IFS='|' read -r id _ _ <<<"$row"
    fn="step_${id//[.-]/_}"
    declare -F "$fn" >/dev/null || {
      log_error "缺少函数 $fn"
      bad=1
    }
  done
  ((bad == 0)) && log_ok "lint 通过：${#PLAN[@]} 个推荐步骤"
  return "$bad"
}

main() {
  local interactive=1
  while (($#)); do
    case "$1" in
      --preset)
        need_arg "$1" $#
        PRESET="$2"
        shift 2
        ;;
      --set)
        need_arg "$1" $#
        set_answer "$2" || exit 2
        shift 2
        ;;
      --only)
        need_arg "$1" $#
        ONLY+=("$2")
        shift 2
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --yes | -y)
        YES=1
        shift
        ;;
      --lint)
        lint_script
        exit
        ;;
      --help | -h)
        usage
        exit
        ;;
      *)
        log_error "未知参数：$1"
        usage
        exit 2
        ;;
    esac
  done
  if [[ -n "$PRESET" ]]; then
    [[ "$PRESET" == recommended ]] || {
      log_error "未知预设：$PRESET"
      exit 2
    }
    ANS["zsh.profile"]=recommended
    apply_recommended
    interactive=0
  fi
  ((${#ANS[@]})) && interactive=0
  if ((interactive)); then
    open_tty || exit 1
    interactive_answers || exit 1
  fi
  defaults
  build_plan
  print_plan
  ((DRY_RUN)) && exit 0
  if ((YES == 0)); then
    printf '\n执行以上 %d 个步骤？[Y/n] ' "${#PLAN[@]}" >&2
    [[ -n "$TTY_FD" ]] || open_tty || exit 1
    local reply
    IFS= read -r reply -u "$TTY_FD" || exit 1
    [[ "$reply" =~ ^[Nn] ]] && exit 0
  fi
  run_plan
}

if [[ "${BASH_SOURCE[0]:-$0}" == "$0" ]]; then main "$@"; fi
