"""Synthetic fixture tests only: no fabricated student-training claims."""
import tempfile
import unittest
import zipfile
from argparse import Namespace
from pathlib import Path
from scripts.train_ednet_full_streaming import inspect_archive, load_keys, role, run


class EdNetStreamingTests(unittest.TestCase):
    def make_fixture(self, directory):
        archive=directory/'kt1_fixture.zip'
        with zipfile.ZipFile(archive, 'w') as z:
            for student in range(30):
                lines=['timestamp,solving_id,question_id,user_answer,elapsed_time']
                for index in range(11):
                    lines.append(f'{index*1000},1,q{index%4+1},{"abcd"[(student+index)%4]},2000')
                z.writestr(f'KT1/u{student}.csv','\n'.join(lines)+'\n')
        key=directory/'questions.csv'
        key.write_text('question_id,correct_answer\nq1,a\nq2,b\nq3,c\nq4,d\n')
        return archive,key

    def test_partial_rejected_without_explicit_fixture_switch(self):
        with tempfile.TemporaryDirectory() as temp:
            archive,key=self.make_fixture(Path(temp))
            with self.assertRaisesRegex(ValueError,'complete official KT1'):
                inspect_archive(archive)

    def test_keys_and_student_partition_are_deterministic(self):
        with tempfile.TemporaryDirectory() as temp:
            archive,key=self.make_fixture(Path(temp))
            answers,vocab=load_keys(key)
            self.assertEqual(len(answers),4)
            self.assertEqual(len(vocab),4)
            first=role('KT1/u10.csv')
            self.assertEqual(first,role('KT1/u10.csv'))
            train=sum(role(f'KT1/u{i}.csv')=='train' for i in range(30))
            self.assertGreater(train,0)
            self.assertLess(train,30)

    def test_entire_fixture_training_and_evaluation_are_not_marked_full(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            archive,key=self.make_fixture(root)
            results=run(Namespace(kt1=archive,questions=key,fixture_test=True,
                                  cpu=True,seed=42,epochs=1,steps=8,batch_size=8,
                                  output=root/'out'))
            self.assertFalse(results['actual_full_archive'])
            self.assertFalse(results['technical_lesson_recommendations_validated'])
            self.assertEqual(results['eligible_student_files'],30)
            self.assertGreater(results['holdout_next_responses'],0)
            self.assertTrue((root/'out'/'ednet_full_metrics.json').is_file())
            self.assertTrue((root/'out'/'ednet_gru.pt').is_file())

if __name__=='__main__':unittest.main()
