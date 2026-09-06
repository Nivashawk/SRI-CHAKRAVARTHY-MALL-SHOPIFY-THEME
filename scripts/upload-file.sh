#!/bin/sh
# Upload a file to Shopify Files, unmodified, and print its CDN filename.
#   sh scripts/upload-file.sh <local-path> <target-filename> [alt text]
#
# Never resize on the way in. Shopify serves derivatives at whatever width the
# theme asks for; scaling up beforehand only fabricates detail and adds
# compression artefacts.
set -e
STORE=sri-chakravarty-mall.myshopify.com
SRC="$1"; NAME="$2"; ALT="${3:-$2}"
[ -f "$SRC" ] || { echo "no such file: $SRC"; exit 1; }
SIZE=$(stat -f%z "$SRC")
case "$NAME" in *.webp) MIME=image/webp;; *.png) MIME=image/png;; *) MIME=image/jpeg;; esac

cat > /tmp/_su.graphql <<'GQL'
mutation Staged($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } }
    userErrors { field message }
  }
}
GQL
printf '{"input":[{"filename":"%s","mimeType":"%s","httpMethod":"POST","resource":"FILE","fileSize":"%s"}]}' \
  "$NAME" "$MIME" "$SIZE" > /tmp/_suv.json
shopify store execute -s $STORE --query-file /tmp/_su.graphql --variable-file /tmp/_suv.json \
  --allow-mutations --json 2>&1 | sed -n '/^{/,$p' > /tmp/_staged.json

node -e '
const fs=require("fs");
const j=JSON.parse(fs.readFileSync("/tmp/_staged.json","utf8"));
const t=((j.data??j).stagedUploadsCreate.stagedTargets||[])[0];
if(!t){console.error("no staged target");process.exit(1)}
fs.writeFileSync("/tmp/_target.json",JSON.stringify(t));
const args=t.parameters.map(p=>`-F ${JSON.stringify(p.name+"="+p.value)}`).join(" ");
fs.writeFileSync("/tmp/_up.sh",`curl -s -o /dev/null -w "  upload HTTP %{http_code}\\n" -X POST ${args} -F "file=@'"$SRC"'" ${JSON.stringify(t.url)}\n`);
'
sh /tmp/_up.sh

RES=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("/tmp/_target.json","utf8")).resourceUrl)')
cat > /tmp/_fc.graphql <<'GQL'
mutation Create($files: [FileCreateInput!]!) {
  fileCreate(files: $files) { files { id fileStatus } userErrors { field message } }
}
GQL
printf '{"files":[{"originalSource":"%s","contentType":"IMAGE","alt":"%s"}]}' "$RES" "$ALT" > /tmp/_fcv.json
shopify store execute -s $STORE --query-file /tmp/_fc.graphql --variable-file /tmp/_fcv.json \
  --allow-mutations --json >/dev/null 2>&1
echo "  created: $NAME"
