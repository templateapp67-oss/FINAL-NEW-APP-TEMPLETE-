export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const compressImageToMaxFileSize = async (
  file: File,
  maxSizeMB: number = 5,
  maxWidthOrHeight: number = 2048
): Promise<File> => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (file.size <= maxSizeBytes) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect ratio
        if (width > height && width > maxWidthOrHeight) {
          height = Math.round((height * maxWidthOrHeight) / width);
          width = maxWidthOrHeight;
        } else if (height > maxWidthOrHeight) {
          width = Math.round((width * maxWidthOrHeight) / height);
          height = maxWidthOrHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.9;
        const compress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file);
                return;
              }
              
              if (blob.size <= maxSizeBytes || quality <= 0.1) {
                resolve(new File([blob], file.name, {
                  type: file.type,
                  lastModified: Date.now(),
                }));
              } else {
                quality -= 0.1;
                compress();
              }
            },
            file.type === 'image/png' ? 'image/png' : 'image/jpeg',
            quality
          );
        };
        
        compress();
      };
      img.onerror = () => resolve(file);
      if (event.target?.result) {
        img.src = event.target.result as string;
      } else {
        resolve(file);
      }
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};
