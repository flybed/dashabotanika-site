#!/bin/sh
# Выкладка (deploy/site-update.sh): новый Caddyfile ставится только после caddy validate, а если после перезагрузки
# сайт или карта сайта отвечают не так, как надо, возвращается прежний. Caddy, systemd и curl здесь — заглушки.
#   sh tests/site_update_test.sh
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/caddy" "$T/usr" "$T/units"
LOG="$T/log"; : > "$LOG"
# заглушки
cat > "$T/bin/caddy" <<'S'
#!/bin/sh
[ "$1" = validate ] && exit "${CADDY_VALID:-0}"
S
cat > "$T/bin/systemctl" <<S
#!/bin/sh
echo "systemctl \$*" >> "$LOG"
S
cat > "$T/bin/logger" <<S
#!/bin/sh
shift 2; echo "logger \$*" >> "$LOG"
S
printf '#!/bin/sh\n' > "$T/bin/sleep"
# curl: «Caddy» с действующим Caddyfile. С маршрутом @sitemap части карты сайта — XML от PocketBase,
# без него — страница сайта (как было до маршрута). BROKEN=1 — сломанный конфиг: карта сайта не отвечает.
cat > "$T/bin/curl" <<S
#!/bin/sh
for a; do u=\$a; done
case "\$u" in
  *api/health) exit 0;;
  */sitemap*.xml)
    [ "\${BROKEN:-0}" = 1 ] && grep -q BROKEN "$T/caddy/Caddyfile" && exit 22
    case "\$u" in */sitemap.xml) echo '<?xml version="1.0"?><urlset/>'; exit 0;; esac
    if grep -q '@sitemap' "$T/caddy/Caddyfile"; then echo '<?xml version="1.0"?><urlset/>'; else echo '<html><div id="app"></div></html>'; fi;;
  *) echo '<html><div id="app"></div></html>';;
esac
S
chmod +x "$T/bin/"*
# «GitHub» и рабочая копия на «сервере»
git init -q --bare "$T/origin.git"
git clone -q "$T/origin.git" "$T/work" 2>/dev/null
mkdir -p "$T/work/deploy" && cp "$ROOT/deploy/"* "$T/work/deploy/"
# конфиг «как до маршрута карты сайта»: части карты сайта уходят на страницу сайта
grep -v -e '@sitemap' -e 'части лежат' "$ROOT/deploy/Caddyfile" > "$T/work/deploy/Caddyfile"
git -C "$T/work" -c user.email=t@t -c user.name=t add -A && git -C "$T/work" -c user.email=t@t -c user.name=t commit -qm init && git -C "$T/work" push -q origin HEAD:main 2>/dev/null
git clone -q -b main "$T/origin.git" "$T/site"
cp "$T/work/deploy/Caddyfile" "$T/caddy/Caddyfile"
OLD=$(cat "$T/caddy/Caddyfile")
push() { git -C "$T/work" -c user.email=t@t -c user.name=t commit -qam "$1" && git -C "$T/work" push -q origin HEAD:main 2>/dev/null; }
run() { : > "$LOG"; PATH="$T/bin:$PATH" SITE_DIR="$T/site" CADDY_DIR="$T/caddy" BIN_DIR="$T/usr" UNITS_DIR="$T/units" sh "$ROOT/deploy/site-update.sh"; }
fails=0
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fails=1; fi; }

run
check 'nothing new: nothing is reloaded' '! grep -q systemctl "$LOG"'

printf '\n# @sitemap route\n@sitemap path_regexp x\n' >> "$T/work/deploy/Caddyfile"; push route
run
check 'a good Caddyfile is installed and Caddy reloaded' 'grep -q "@sitemap" "$T/caddy/Caddyfile" && grep -q "systemctl reload caddy" "$LOG"'
check '… the site and the sitemaps were checked and it stays' 'grep -q "is live" "$LOG"'
GOOD=$(cat "$T/caddy/Caddyfile")

printf '# BROKEN\n' >> "$T/work/deploy/Caddyfile"; push broken
BROKEN=1 run
check 'a valid Caddyfile that breaks the sitemap: the previous one is back' '[ "$(cat "$T/caddy/Caddyfile")" = "$GOOD" ] && grep -q "restored the previous one" "$LOG" && [ "$(grep -c "systemctl reload caddy" "$LOG")" = 2 ]'
check '… the log says what failed' 'grep -q "sitemap.xml: no answer" "$LOG"'

printf '# invalid\n' >> "$T/work/deploy/Caddyfile"; push invalid
CADDY_VALID=1 run
check 'an invalid Caddyfile is not installed at all' '[ "$(cat "$T/caddy/Caddyfile")" = "$GOOD" ] && grep -q "invalid, kept the old one" "$LOG" && ! grep -q "reload caddy" "$LOG"'

# a Caddyfile without the sitemap route (as before it): the parts would be the site page — refused
printf '%s\n' "$OLD" > "$T/work/deploy/Caddyfile"; push "back to old"
run
check 'a Caddyfile that sends /sitemap-pages.xml to the site page is rolled back' '[ "$(cat "$T/caddy/Caddyfile")" = "$GOOD" ] && grep -q "sitemap-pages.xml: not XML" "$LOG"'

echo 'x' >> "$T/work/deploy/pb-backup.sh"; push "other deploy file"
run
check 'other deploy files: units reinstalled, Caddy not touched' 'grep -q daemon-reload "$LOG" && ! grep -q "reload caddy" "$LOG"'
[ $fails = 0 ] && echo "ALL OK" || { echo FAILED; exit 1; }
