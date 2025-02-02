#! /bin/bash

platform="$1"
app="$2"
mode="$3"
webpackmode="development"
cordovamode=""

if [ -z "$platform" ]; then
  platform="android"
fi

if [ -z "$mode" ]; then
  mode="d"
fi

if [ -z "$app" ]; then
  app="node"
fi

if [ "$mode" = "p" ] || [ "$mode" = "prod" ]; then
  mode="p"
  webpackmode="production"
  cordovamode="--release"
fi

RED='\033[0;31m'  # Escape sequence for red color (optional)
NC='\033[0m'    # Escape sequence for reset color (optional)

script1="node ./utils/config.js $mode $app"
script2="webpack --progress --mode $webpackmode "
script3="node ./utils/loadStyles.js"
script4="cordova build $platform $cordovamode -- --jvmargs='-Xmx1536M --add-exports=java.base/sun.nio.ch=ALL-UNNAMED --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.lang.reflect=ALL-UNNAMED --add-opens=java.base/java.io=ALL-UNNAMED --add-exports=jdk.unsupported/sun.misc=ALL-UNNAMED'"

script5="node ./utils/rename.js $mode $app"

eval "
  echo \"${RED}$script1${NC}\";
  $script1 || exit 1;  # Exit if script1 fails

  echo \"${RED}$script2${NC}\";
  $script2 || exit 1;  # Exit if script2 fails

  echo \"${RED}$script3${NC}\";
  $script3 || exit 1;  # Exit if script3 fails

  echo \"${RED}$script4${NC}\";
  $script4 || exit 1;  # Exit if script4 fails

  echo \"${RED}$script5${NC}\";
  $script5 || exit 1;  # Exit if script5 fails
"

# Loop through files after all scripts finish
for f in *; do
  echo "File -> $f"
done
