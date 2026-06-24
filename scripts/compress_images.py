import os
import sys
from PIL import Image
from pathlib import Path

def compress_image(input_path, output_path, max_width=512, max_height=512, quality=80):
    try:
        with Image.open(input_path) as img:
            original_size = os.path.getsize(input_path)
            
            width, height = img.size
            if width > max_width or height > max_height:
                ratio = min(max_width / width, max_height / height)
                new_width = int(width * ratio)
                new_height = int(height * ratio)
                img = img.resize((new_width, new_height), Image.LANCZOS)
            
            if img.mode == 'P':
                img = img.convert('RGBA')
            
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            webp_path = output_path.parent / f"{output_path.stem}.webp"
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
            'path': str(input_path)
        }

def main():
    base_dir = Path(r'd:\Projects\UCAS_BOX')
    source_dir = base_dir / 'assets_s'
    target_dir = base_dir / 'assets'
    
    if not source_dir.exists():
        print(f"错误: 源目录不存在 - {source_dir}")
        sys.exit(1)
    
    target_dir.mkdir(parents=True, exist_ok=True)
    
    image_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp')
    
    images = []
    for ext in image_extensions:
        images.extend(source_dir.rglob(f'*{ext}'))
        images.extend(source_dir.rglob(f'*{ext.upper()}'))
    
    images = sorted(set(images))
    
    if not images:
        print("没有找到图片文件")
        sys.exit(0)
    
    print(f"找到 {len(images)} 个图片文件\n")
    
    total_original = 0
    total_compressed = 0
    success_count = 0
    failed_count = 0
    
    for img_path in images:
        rel_path = img_path.relative_to(source_dir)
        output_path = target_dir / rel_path
        
        result = compress_image(str(img_path), str(output_path))
        
        if result['success']:
            success_count += 1
            total_original += result['original']
            total_compressed += result['compressed']
            print(f"✓ {rel_path.as_posix()}")
            print(f"   原始: {result['original']:,} bytes")
            print(f"   WebP: {result['compressed']:,} bytes")
            print(f"   节省: {result['saved']:.1f}%")
            print(f"   输出: {Path(result['webp_path']).relative_to(base_dir).as_posix()}\n")
        else:
            failed_count += 1
            print(f"✗ {rel_path.as_posix()}")
            print(f"   错误: {result['error']}\n")
    
    print("=" * 60)
    print(f"完成: {success_count} 成功, {failed_count} 失败")
    
    if total_original > 0:
        total_saved = ((total_original - total_compressed) / total_original * 100)
        print(f"总原始大小: {total_original:,} bytes ({total_original / 1024 / 1024:.2f} MB)")
        print(f"总WebP大小: {total_compressed:,} bytes ({total_compressed / 1024 / 1024:.2f} MB)")
        print(f"总节省: {total_saved:.1f}%")
        print(f"\n输出目录: {target_dir}")
        print("注意: 原始文件未被修改，已生成对应的WebP文件到assets目录")

if __name__ == '__main__':
    main()
