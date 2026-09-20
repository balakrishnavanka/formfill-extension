#!/usr/bin/env python3
"""
FormFill Pro — Cross-Browser Extension Packager
Packs extension source files into Dist/formfill-pro-v1.0.0.zip
Compatible with Google Chrome, Microsoft Edge, and Mozilla Firefox.
"""

import os
import zipfile

def pack_extension():
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dist_dir = os.path.join(project_dir, 'Dist')
    os.makedirs(dist_dir, exist_ok=True)

    zip_filename = os.path.join(dist_dir, 'formfill-pro-v1.0.0.zip')

    files_to_pack = [
        'manifest.json',
        'service-worker.js',
        'content.js',
        'README.md'
    ]

    dirs_to_pack = ['popup', 'icons']

    print(f"[FormFill Pro] Packing extension into {zip_filename}...")

    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
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

    print(f"\n✅ FormFill Pro packed successfully! File created at:")
    print(f"   {zip_filename}")

if __name__ == '__main__':
    pack_extension()
