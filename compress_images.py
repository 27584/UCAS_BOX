import os
import sys
from PIL import Image
from pathlib import Path

def compress_image(input_path, max_width=512, max_height=512, quality=80):
    try:
        with Image.open(input_path) as img:
            original_size = os.path.getsize(input_path)
            input_path = Path(input_path)
            
            width, height = img.size
            if width > max_width or height > max_height:
                ratio = min(max_width / width, max_height / height)
                new_width = int(width * ratio)
                new_height = int(height * ratio)
                img = img.resize((new_width, new_height), Image.LANCZOS)
            
            if img.mode == 'P':
                img = img.convert('RGBA')
            
            webp_path = input_path.parent / f"{input_path.stem}.webp"
            img.save(str(webp_path), 'WEBP', quality=quality, lossless=False, method=6)
            
            compressed_size = os.path.getsize(str(webp_path))
            saved_percent = ((original_size - compressed_size) / original_size * 100) if original_size > 0 else 0
            
            return {
                'success': True,
                'original': original_size,
                'compressed': compressed_size,
                'saved': saved_percent,
                'path': str(input_path),
                'webp_path': str(webp_path)
            }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'path': input_path
        }

def main():
    items_dir = Path(r'd:\Projects\UCAS_BOX\assets\items')
    
    if not items_dir.exists():
        print(f"错误: 目录不存在 - {items_dir}")
        sys.exit(1)
    
    image_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp')
    images = [f for f in items_dir.iterdir() if f.suffix.lower() in image_extensions]
    
    if not images:
        print("没有找到图片文件")
        sys.exit(0)
    
    print(f"找到 {len(images)} 个图片文件\n")
    
    total_original = 0
    total_compressed = 0
    success_count = 0
    failed_count = 0
    
    for img_path in images:
        result = compress_image(str(img_path))
        
        if result['success']:
            success_count += 1
            total_original += result['original']
            total_compressed += result['compressed']
            print(f"✓ {img_path.name}")
            print(f"   原始: {result['original']:,} bytes")
            print(f"   WebP: {result['compressed']:,} bytes")
            print(f"   节省: {result['saved']:.1f}%\n")
        else:
            failed_count += 1
            print(f"✗ {img_path.name}")
            print(f"   错误: {result['error']}\n")
    
    print("=" * 50)
    print(f"完成: {success_count} 成功, {failed_count} 失败")
    
    if total_original > 0:
        total_saved = ((total_original - total_compressed) / total_original * 100)
        print(f"总原始大小: {total_original:,} bytes")
        print(f"总WebP大小: {total_compressed:,} bytes")
        print(f"总节省: {total_saved:.1f}%")
        print("\n注意: 原始PNG文件未被覆盖，已生成对应的WebP文件")

if __name__ == '__main__':
    main()