#!/usr/bin/env bash
# 把本仓库的 skill 软链到 pi、Claude Code 和/或 codex 的 skills 目录。
# 软链而不是复制：git pull 之后立刻生效。
#
#   ./scripts/install.sh              安装全部，安装到检测到的所有 agent
#   ./scripts/install.sh novel-characters
#   ./scripts/install.sh --pi         只安装到 pi
#   ./scripts/install.sh --claude     只安装到 Claude Code
#   ./scripts/install.sh --codex      只安装到 codex
#   ./scripts/install.sh --uninstall  取消软链
#
# 安装到 Claude Code 时，同时把 agents/ 下的 subagent 定义软链到 ~/.claude/agents。
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$REPO/skills"

targets=()
wanted=()
uninstall=0

for arg in "$@"; do
  case "$arg" in
    --pi)        targets+=("$HOME/.pi/agent/skills") ;;
    --claude)    targets+=("$HOME/.claude/skills") ;;
    --codex)     targets+=("$HOME/.codex/skills") ;;
    --uninstall) uninstall=1 ;;
    -h|--help)   sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
  # 清理本仓库安装的退役 skill 软链；其他仓库软链和真实目录不动。
  retired="$target/novel-storyboard"
  if [ -L "$retired" ] && [ "$(readlink "$retired")" = "$SKILLS_DIR/novel-storyboard" ]; then
    rm "$retired"
    echo "− ${retired}（已移除的 skill）"
  fi
  for name in "${wanted[@]}"; do
    src="$SKILLS_DIR/$name"
    dst="$target/$name"
    if [ "$uninstall" -eq 1 ] && [ "$name" = "novel-storyboard" ]; then
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
  # subagent 定义只有 Claude Code 使用；只管理指向本仓库的软链
  if [ "$target" = "$HOME/.claude/skills" ]; then
    agents="$HOME/.claude/agents"
    for src in "$REPO"/agents/*.md; do
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
