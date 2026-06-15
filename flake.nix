{
  description = "Wikeep Chrome extension development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "x86_64-linux"
        "aarch64-linux"
      ];
    in
    {
      devShells = nixpkgs.lib.genAttrs systems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          node = pkgs.nodejs_22;
          linuxBrowserPackages = pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.chromium ];

          npmInstall = ''
            if [ -f package-lock.json ]; then
              echo "Installing dependencies with npm ci..."
              npm ci
            else
              echo "WARNING: package-lock.json not found; using npm install."
              echo "Commit a lockfile for reproducible installs."
              npm install
            fi
          '';

          npmTest = ''
            echo "Running tests..."
            npm test -- --passWithNoTests
          '';

          manifestChecks = ''
            echo "Checking built Manifest V3 (dist/manifest.json)..."
            test -f dist/manifest.json || {
              echo "dist/manifest.json missing; build did not run."
              exit 1
            }
            jq -e '.manifest_version == 3' dist/manifest.json > /dev/null
            jq -e '.background.service_worker | type == "string"' dist/manifest.json > /dev/null
            jq -e '.side_panel.default_path | type == "string"' dist/manifest.json > /dev/null
            echo "OK: MV3 manifest invariants hold."
          '';

          wikeep-check = pkgs.writeShellApplication {
            name = "wikeep-check";
            runtimeInputs = [
              node
              pkgs.jq
            ];
            text = ''
              set -euo pipefail
              ${npmInstall}
              echo "Running TypeScript check..."
              npm run typecheck
              ${npmTest}
              echo "Building (needed to validate dist/manifest.json)..."
              npm run build
              ${manifestChecks}
              echo "OK: typecheck, tests, build, and manifest checks passed."
            '';
          };

          wikeep-build = pkgs.writeShellApplication {
            name = "wikeep-build";
            runtimeInputs = [
              node
              pkgs.jq
              pkgs.zip
            ];
            text = ''
              set -euo pipefail
              ${npmInstall}
              echo "Running TypeScript check..."
              npm run typecheck
              ${npmTest}
              echo "Building extension..."
              npm run build
              ${manifestChecks}
              echo "Packaging extension..."
              rm -f wikeep-extension.zip
              (
                cd dist
                zip -qr ../wikeep-extension.zip .
              )
              echo "Built:  dist/"
              echo "Packed: wikeep-extension.zip"
            '';
          };

          wikeep-open-browser = pkgs.writeShellApplication {
            name = "wikeep-open-browser";
            runtimeInputs = [ node ] ++ linuxBrowserPackages;
            text = ''
              set -euo pipefail

              if [ ! -d dist ]; then
                echo "dist/ not found. Building first..."
                if [ -f package-lock.json ]; then
                  npm ci
                else
                  npm install
                fi
                npm run build
              fi

              PROFILE_DIR="$PWD/.chrome-dev-profile"
              EXTENSION_DIR="$PWD/dist"
              # Remote debugging port for Chrome DevTools MCP (override: DEBUG_PORT=... wikeep-open-browser)
              DEBUG_PORT="''${DEBUG_PORT:-9222}"
              FLAGS=(
                "--remote-debugging-port=$DEBUG_PORT"
                "--user-data-dir=$PROFILE_DIR"
                "--disable-extensions-except=$EXTENSION_DIR"
                "--load-extension=$EXTENSION_DIR"
                "chrome://extensions"
              )

              echo "Launching Chromium-based browser with Wikeep (dist/) loaded."
              echo "Remote debugging on http://127.0.0.1:$DEBUG_PORT"
              echo "Point chrome-devtools-mcp at it with: --browserUrl=http://127.0.0.1:$DEBUG_PORT"

              if [ "$(uname)" = "Darwin" ]; then
                if [ -d "/Applications/Google Chrome.app" ]; then
                  exec open -na "Google Chrome" --args "''${FLAGS[@]}"
                fi
                if [ -d "$HOME/Applications/Google Chrome.app" ]; then
                  exec open -na "$HOME/Applications/Google Chrome.app" --args "''${FLAGS[@]}"
                fi
                if [ -d "/Applications/Helium.app" ]; then
                  exec open -na "/Applications/Helium.app" --args "''${FLAGS[@]}"
                fi
                if [ -d "$HOME/Applications/Helium.app" ]; then
                  exec open -na "$HOME/Applications/Helium.app" --args "''${FLAGS[@]}"
                fi
                echo "No supported Chromium-based browser app found in /Applications or $HOME/Applications."
                echo "Tried: Google Chrome.app, Helium.app"
                echo "Install one of them, or load dist/ manually (see PLAN.md)."
                exit 1
              fi

              if command -v chromium > /dev/null 2>&1; then
                exec chromium "''${FLAGS[@]}"
              fi
              if command -v google-chrome > /dev/null 2>&1; then
                exec google-chrome "''${FLAGS[@]}"
              fi

              echo "No Chrome/Chromium found. Load dist/ manually (see PLAN.md)."
              exit 1
            '';
          };

          wikeep-open-chrome = pkgs.writeShellApplication {
            name = "wikeep-open-chrome";
            runtimeInputs = [ wikeep-open-browser ];
            text = ''
              set -euo pipefail
              echo "wikeep-open-chrome is deprecated; using wikeep-open-browser instead."
              exec wikeep-open-browser
            '';
          };
        in
        {
          default = pkgs.mkShell {
            packages = [
              node
              pkgs.git
              pkgs.jq
              pkgs.zip
              pkgs.unzip
              wikeep-check
              wikeep-build
              wikeep-open-browser
              wikeep-open-chrome
            ]
            ++ linuxBrowserPackages;

            shellHook = ''
              echo "Wikeep dev shell"
              echo "Node: $(node --version)   npm: $(npm --version)"
              echo
              echo "Commands:"
              echo "  npm ci / npm install   install dependencies"
              echo "  npm run typecheck      TypeScript check"
              echo "  npm test               Vitest (use -- --passWithNoTests if empty)"
              echo "  npm run build          build into dist/"
              echo "  wikeep-check           install + typecheck + test + build + manifest checks"
              echo "  wikeep-build           full validation + build + ZIP"
              echo "  wikeep-open-browser    launch browser with dist/ loaded + remote debug (port 9222)"
              echo "  wikeep-open-chrome     compatibility alias for wikeep-open-browser"
            '';
          };
        }
      );
    };
}
