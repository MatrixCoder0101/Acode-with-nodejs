const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const ANDROID_WWW = path.resolve(
  __dirname,
  "platforms/android/app/src/main/assets/www"
);
const WWW = path.resolve(__dirname, 'www');

// let timeout, isExecuting;
// function buildAndroidApp() {
//   if (timeout) clearTimeout(timeout);
//   timeout = setTimeout(() => {
//     execSync(
//       `cordova prepare`, { cwd: path.resolve(__dirname) },
//       (err, stdout, stderr) => {
//         if (err) {
//           console.error(err);
//           return;
//         }
//         console.log(stdout, stderr);
//       }
//     );
//   }, 1000);
// }

module.exports = (env, options) => {
  const { mode = "development" } = options;
  const rules = [
    {
      test: /\.hbs$/,
      use: ["raw-loader"]
    },
    {
      test: /\.module.(sa|sc|c)ss$/,
      use: ["raw-loader", "postcss-loader", "sass-loader"]
    },
    {
      test: /(?<!\.module)\.(sa|sc|c)ss$/,
      use: [
        {
          loader: MiniCssExtractPlugin.loader,
          options: {
            publicPath: "../../"
          }
        },
        {
          loader: "css-loader",
          options: {
            url: false
          }
        },
        "postcss-loader",
        "sass-loader"
      ]
    }
  ];

  // if (mode === 'production') {
  rules.push({
    test: /\.m?js$/,
    use: [
      "html-tag-js/jsx/tag-loader.js",
      {
        loader: "babel-loader",
        options: {
          presets: ["@babel/preset-env"]
        }
      }
    ]
  });
  // }

  clearOutputDir();

  const main = {
    mode,
    entry: {
      main: "./src/lib/main.js",
      console: "./src/lib/console.js",
      searchInFilesWorker: "./src/sidebarApps/searchInFiles/worker.js"
    },
    output: {
      path: path.resolve(WWW, "js/build/"),
      filename: "[name].build.js",
      chunkFilename: "[name].build.js",
      publicPath: "./js/build/"
    },
    module: {
      rules
    },
    resolve: {
      fallback: {
        path: require.resolve("path-browserify"),
        crypto: false
      },
      modules: ["node_modules", "src"]
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: "../../css/build/[name].css"
      }),
      // {
      //   apply: compiler => {
      //     compiler.hooks.afterDone.tap("prepare", () => {
      //       // run cordova prepare
      //       buildAndroidApp();
      //   }
      // }
    ],
    // devServer: {
    //   static: {
    //     directory: ANDROID_WWW,
    //     watch: true
    //   },
    //   hot: false,
    //   liveReload: true,
    //   compress: true,
    //   port: 9000,
    // }
  };

  return [main];
};

function clearOutputDir() {
  const css = path.join(WWW, "css/build");
  const js = path.join(WWW, "js/build");

  fs.rmSync(css, { recursive: true });
  fs.rmSync(js, { recursive: true });

  fs.mkdir(css, err => {
    if (err) console.log(err);
  });
  fs.mkdir(js, err => {
    if (err) console.log(err);
  });
}
