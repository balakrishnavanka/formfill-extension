#!/usr/bin/env python3
"""
FormFill Pro — Cross-Browser Extension Packager
Packs extension source files into Dist/formfill-pro-v1.0.0.zip
Compatible with Google Chrome, Microsoft Edge, and Mozilla Firefox.
"""

import os
import zipfile

import json

def pack_extension():
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dist_dir = os.path.join(project_dir, 'Dist')
    os.makedirs(dist_dir, exist_ok=True)

    files_to_pack = ['service-worker.js', 'content.js', 'injected.js', 'README.md']
    dirs_to_pack = ['popup', 'icons']
    manifest_path = os.path.join(project_dir, 'manifest.json')

    with open(manifest_path, 'r') as f:
        manifest_data = json.load(f)

    def write_zip(zip_filename, manifest_dict):
        print(f"[FormFill Pro] Packing extension into {zip_filename}...")
        with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Write dynamic manifest
            zipf.writestr('manifest.json', json.dumps(manifest_dict, indent=2))
            print(f"  + Added: manifest.json")

            for f in files_to_pack:
                filepath = os.path.join(project_dir, f)
                if os.path.exists(filepath):
                    zipf.write(filepath, arcname=f)
                    print(f"  + Added: {f}")

            for d in dirs_to_pack:
                dirpath = os.path.join(project_dir, d)
                if os.path.exists(dirpath):
                    for root, _, files in os.walk(dirpath):
                        for file in files:
                            full_path = os.path.join(root, file)
                            arcname = os.path.relpath(full_path, project_dir)
                            zipf.write(full_path, arcname=arcname)
                            print(f"  + Added: {arcname}")
        print(f"✅ Created: {zip_filename}\n")

    # Chrome Build (Original Manifest)
    chrome_zip = os.path.join(dist_dir, 'formfill-pro-chrome.zip')
    write_zip(chrome_zip, manifest_data)

    # Firefox Build (Strip 'debugger' permission)
    firefox_zip = os.path.join(dist_dir, 'formfill-pro-firefox.zip')
    ff_manifest = json.loads(json.dumps(manifest_data))
    if 'debugger' in ff_manifest.get('permissions', []):
        ff_manifest['permissions'].remove('debugger')
    write_zip(firefox_zip, ff_manifest)

if __name__ == '__main__':
    pack_extension()
