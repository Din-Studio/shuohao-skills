#!/usr/bin/env bash
# 把本仓库的 skill 软链到 pi、Claude Code 和/或 codex 的 skills 目录。
# 软链而不是复制：git pull 之后立刻生效。
#
#   ./scripts/install.sh              安装全部，安装到检测到的所有 agent
#   ./scripts/install.sh mint-characters
#   ./scripts/install.sh --pi         只安装到 pi
#   ./scripts/install.sh --claude     只安装到 Claude Code
#   ./scripts/install.sh --codex      只安装到 codex
#   ./scripts/install.sh --uninstall  取消软链
#
# 安装到 Claude Code 时，同时把 agents/ 下的 subagent 定义软链到 ~/.claude/agents；
# 安装到 pi 时，把 agents/pi/ 下的角色定义软链到 ~/.pi/agent/agents（子代理扩展默认读取的用户级目录）。
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$REPO/skills"
retired_skills=(novel-storyboard novel-art novel-characters novel-creation novel-outline novel-script novel-setup novel-video-prompt novel-video-prompt-review)

targets=()
wanted=()
uninstall=0

for arg in "$@"; do
  case "$arg" in
    --pi)        targets+=("$HOME/.pi/agent/skills") ;;
    --claude)    targets+=("$HOME/.claude/skills") ;;
    --codex)     targets+=("$HOME/.codex/skills") ;;
    --uninstall) uninstall=1 ;;
    -h|--help)   sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)          echo "未知选项 $arg" >&2; exit 1 ;;
    *)           wanted+=("$arg") ;;
  esac
done

# 没指定目标就自动检测：哪个 agent 装了就装到哪
if [ ${#targets[@]} -eq 0 ]; then
  [ -d "$HOME/.pi/agent" ] && targets+=("$HOME/.pi/agent/skills") || true
  [ -d "$HOME/.claude" ] && targets+=("$HOME/.claude/skills") || true
  [ -d "$HOME/.codex" ] && targets+=("$HOME/.codex/skills") || true
fi
if [ ${#targets[@]} -eq 0 ]; then
  echo "没找到 ~/.pi、~/.claude 或 ~/.codex，指定 --pi、--claude 或 --codex 试试" >&2
  exit 1
fi

# 没指定 skill 就装全部
if [ ${#wanted[@]} -eq 0 ]; then
  for d in "$SKILLS_DIR"/*/; do
    [ -f "$d/SKILL.md" ] && wanted+=("$(basename "$d")")
  done
fi

for target in "${targets[@]}"; do
  mkdir -p "$target"
  # 清理本仓库安装的退役或改名 skill 软链；其他仓库软链和真实目录不动。
  for name in "${retired_skills[@]}"; do
    # 单独安装／卸载时，只清理选中技能的旧链接；其余旧安装保留到用户更新它们时处理。
    if [ "$name" != "novel-storyboard" ] && [[ " ${wanted[*]} " != *" $name "* ]] && [[ " ${wanted[*]} " != *" ${name/novel-/mint-} "* ]]; then
      continue
    fi
    retired="$target/$name"
    if [ -L "$retired" ] && [ "$(readlink "$retired")" = "$SKILLS_DIR/$name" ]; then
      rm "$retired"
      echo "− ${retired}（已移除或改名的 skill）"
    fi
  done
  for name in "${wanted[@]}"; do
    src="$SKILLS_DIR/$name"
    dst="$target/$name"
    if [ "$uninstall" -eq 1 ] && [[ " ${retired_skills[*]} " == *" $name "* ]]; then
      continue  # 退役软链已在上面按归属检查；无须源目录仍然存在。
    fi
    if [ ! -f "$src/SKILL.md" ]; then
      echo "✗ $name — 不是一个 skill（缺 SKILL.md）" >&2
      exit 1
    fi
    if [ "$uninstall" -eq 1 ]; then
      if [ -L "$dst" ]; then rm "$dst"; echo "− $dst"; fi
      continue
    fi
    # 只覆盖软链；真实目录是用户自己放的，不动
    if [ -e "$dst" ] && [ ! -L "$dst" ]; then
      echo "✗ $dst 已存在且不是软链，跳过" >&2
      continue
    fi
    ln -sfn "$src" "$dst"
    echo "✓ $dst → $src"
  done
  # 角色定义：Claude Code 读取 ~/.claude/agents；pi 的子代理扩展默认读取用户级 ~/.pi/agent/agents。
  # 只管理指向本仓库的软链
  agents=""
  case "$target" in
    "$HOME/.claude/skills")    agents="$HOME/.claude/agents"; defs="$REPO/agents" ;;
    "$HOME/.pi/agent/skills")  agents="$HOME/.pi/agent/agents"; defs="$REPO/agents/pi" ;;
  esac
  if [ -n "$agents" ]; then
    for name in novel-video-prompt-writer novel-video-prompt-reviewer; do
      retired="$agents/$name.md"
      if [ -L "$retired" ] && [ "$(readlink "$retired")" = "$defs/$name.md" ]; then
        rm "$retired"
        echo "− ${retired}（已改名的角色定义）"
      fi
    done
    for src in "$defs"/*.md; do
      [ -f "$src" ] || continue
      dst="$agents/$(basename "$src")"
      if [ "$uninstall" -eq 1 ]; then
        if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then rm "$dst"; echo "− $dst"; fi
        continue
      fi
      if [ -e "$dst" ] && [ ! -L "$dst" ]; then
        echo "✗ $dst 已存在且不是软链，跳过" >&2
        continue
      fi
      mkdir -p "$agents"
      ln -sfn "$src" "$dst"
      echo "✓ $dst → $src"
    done
  fi
done
