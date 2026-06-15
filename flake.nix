{
  description = "Wikeep Chrome extension development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
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
          linuxBrowserPackages =
            pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.chromium ];

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

          wikeep-open-chrome = pkgs.writeShellApplication {
            name = "wikeep-open-chrome";
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
              FLAGS=(
                "--user-data-dir=$PROFILE_DIR"
                "--disable-extensions-except=$EXTENSION_DIR"
                "--load-extension=$EXTENSION_DIR"
                "chrome://extensions"
              )

              if [ "$(uname)" = "Darwin" ]; then
                if [ -d "/Applications/Google Chrome.app" ]; then
                  exec open -na "Google Chrome" --args "''${FLAGS[@]}"
                fi
                echo "Google Chrome.app not found in /Applications."
                echo "Install Chrome, or load dist/ manually (see PLAN.md)."
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
              wikeep-open-chrome
            ] ++ linuxBrowserPackages;

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
              echo "  wikeep-open-chrome     launch Chrome with dist/ loaded"
            '';
          };
        }
      );
    };
}
