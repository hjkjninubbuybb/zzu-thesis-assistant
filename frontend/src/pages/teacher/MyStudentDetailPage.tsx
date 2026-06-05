import { useParams } from 'react-router-dom';
import { MyStudentDetail } from '@features/mentor';

export default function MyStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <MyStudentDetail studentId={Number(id)} />;
}
