// hooks/useNumbers.ts
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchActiveNumbers } from '@/store/slices/numbersSlice';

const useNumbers = () => {
  const dispatch = useDispatch<AppDispatch>();
  const numbers = useSelector((state: RootState) => state.numbers);

  const refreshNumbers = (page: number = 1, limit: number = 20) => {
    dispatch(fetchActiveNumbers({ page, limit }));
  };

  return {
    ...numbers,
    refreshNumbers,
  };
};

export default useNumbers;