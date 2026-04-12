#!/bin/bash
# 检查三层架构 import 违规
# 合法流向: presentation → service → data → shared
# 违规: service→presentation, data→service, data→presentation, presentation→data

cd "$(dirname "$0")/.." || exit 1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

total=0

echo "=== 架构 import 违规检查 ==="
echo ""

# 1) service → presentation
count=$(grep -rn "from '.*presentation" src/service/ --include='*.ts' --include='*.js' 2>/dev/null | grep -v '// arch-ok' | wc -l | tr -d ' ')
total=$((total + count))
if [ "$count" -gt 0 ]; then
  echo -e "${RED}[FAIL] service → presentation: $count 条${NC}"
  grep -rn "from '.*presentation" src/service/ --include='*.ts' --include='*.js' 2>/dev/null | grep -v '// arch-ok'
else
  echo -e "${GREEN}[PASS] service → presentation: 0 条${NC}"
fi
echo ""

# 2) data → service
count=$(grep -rn "from '.*service" src/data/ --include='*.ts' --include='*.js' 2>/dev/null | grep -v '// arch-ok' | wc -l | tr -d ' ')
total=$((total + count))
if [ "$count" -gt 0 ]; then
  echo -e "${RED}[FAIL] data → service: $count 条${NC}"
  grep -rn "from '.*service" src/data/ --include='*.ts' --include='*.js' 2>/dev/null | grep -v '// arch-ok'
else
  echo -e "${GREEN}[PASS] data → service: 0 条${NC}"
fi
echo ""

# 3) data → presentation
count=$(grep -rn "from '.*presentation" src/data/ --include='*.ts' --include='*.js' 2>/dev/null | grep -v '// arch-ok' | wc -l | tr -d ' ')
total=$((total + count))
if [ "$count" -gt 0 ]; then
  echo -e "${RED}[FAIL] data → presentation: $count 条${NC}"
  grep -rn "from '.*presentation" src/data/ --include='*.ts' --include='*.js' 2>/dev/null | grep -v '// arch-ok'
else
  echo -e "${GREEN}[PASS] data → presentation: 0 条${NC}"
fi
echo ""

# 4) presentation → data
count=$(grep -rn "from '.*data/" src/presentation/ --include='*.ts' --include='*.js' 2>/dev/null | grep -v '// arch-ok' | wc -l | tr -d ' ')
total=$((total + count))
if [ "$count" -gt 0 ]; then
  echo -e "${YELLOW}[WARN] presentation → data: $count 条${NC}"
  grep -rn "from '.*data/" src/presentation/ --include='*.ts' --include='*.js' 2>/dev/null | grep -v '// arch-ok'
else
  echo -e "${GREEN}[PASS] presentation → data: 0 条${NC}"
fi
echo ""

echo "=== 总计违规: $total 条 ==="
if [ "$total" -gt 0 ]; then
  exit 1
else
  echo -e "${GREEN}全部通过！${NC}"
  exit 0
fi
