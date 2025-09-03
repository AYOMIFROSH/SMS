import { useEffect } from 'react';

export const useDocumentTitle = (title: string) => {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    
    // Optional: restore previous title on cleanup
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
};