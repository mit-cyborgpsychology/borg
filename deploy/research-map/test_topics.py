import copy
import json
from pathlib import Path
import tempfile
import unittest
from topics import build_topics, cluster
from worker import update_projection


def records():
    return [{'url': f'https://example.com/{i}', 'embedding': [1, i+1], 'title': f'Paper {i}', 'document': f'Summary {i}'} for i in range(6)]


def projection(items):
    return {'method': 'umap', 'points': [{'url':r['url'], 'x':i/6, 'y':i/6} for i,r in enumerate(items)]}


def groups(items):
    return [items[:3], items[3:]]


class TopicTests(unittest.TestCase):
    def test_cache_membership_and_stable_colors(self):
        items=records(); cache={}; calls=[]
        def labeler(requests):
            calls.append(requests)
            return {g['id']: 'Topic name ' + g['id'] for g in requests}
        first=build_topics(items, projection(items), {}, cache, labeler, groups)
        second=build_topics(items, projection(items), first, cache, labeler, lambda items:groups(items)[::-1])
        self.assertEqual(len(calls),1)
        by_members=lambda value: {tuple(t['members']):(t['id'],t['color'],t['label']) for t in value['topics']}
        self.assertEqual(by_members(first),by_members(second))
        self.assertTrue(all(p.get('topicId') for p in second['points']))
        changed=copy.deepcopy(items); changed[0]['document']='Updated summary'
        build_topics(changed, projection(changed), second, cache, labeler, groups)
        self.assertEqual(len(calls),2)
        self.assertEqual(len(calls[-1]),1, 'Only changed group needs labeling')

    def test_failed_labels_retry_without_refitting_umap(self):
        calls=[]; fail=[True]
        def labeler(requests):
            calls.append(requests)
            if fail[0]: raise TimeoutError()
            return {g['id']:'Readable topic' for g in requests}
        def topics(items, result, previous, cache):
            return build_topics(items,result,previous,cache,labeler,groups)
        fits=[]
        def fit(items):
            fits.append(items); return projection(items)
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'map.json'
            self.assertTrue(update_projection(records(),path,fit,topics,now=0))
            self.assertTrue(json.loads(path.read_text())['labelsPending'])
            self.assertFalse(update_projection(records(),path,fit,topics,now=100))
            fail[0]=False
            self.assertTrue(update_projection(records(),path,fit,topics,now=301))
            self.assertEqual(len(fits),1)
            self.assertFalse(json.loads(path.read_text())['labelsPending'])
            self.assertFalse(update_projection(records(),path,fit,topics,now=1000))
            self.assertEqual(len(calls),2)

    def test_kmeans_small_and_identical_vectors(self):
        items=records()
        self.assertEqual(len(cluster(items)),2)
        self.assertEqual(cluster(items),cluster(items))
        for item in items: item['embedding']=[1,1]
        self.assertEqual(len(cluster(items)),1)

    def test_partial_projection_only_groups_mapped_papers(self):
        items=records()
        projected=projection(items[:1])
        result=build_topics(items, projected, {}, {}, lambda request:{'topic-1':'Mapped topic'}, lambda items:[items])
        self.assertEqual(result['topics'][0]['count'],1)
        self.assertEqual(result['topics'][0]['members'],[items[0]['url']])

    def test_malformed_label_is_not_cached(self):
        cache={}; items=records()
        result=build_topics(items,projection(items),{},cache,lambda request:{g['id']:'x'*100 for g in request},groups)
        self.assertTrue(result['labelsPending'])
        self.assertEqual(cache,{})

class BatchedTopicTests(unittest.TestCase):
    def test_new_points_keep_topics_until_multiple_of_ten(self):
        from topics import update_topics
        items=[{'url':f'https://example.com/{i}', 'embedding':[1 if i%2 else -1,0.1], 'title':f'Paper {i}'} for i in range(34)]
        fits=[]; label_calls=[]; cache={}
        def grouper(rows):
            fits.append(len(rows))
            return [[r for r in rows if r['embedding'][0]>0], [r for r in rows if r['embedding'][0]<0]]
        def labeler(groups):
            label_calls.append(groups)
            return {g['id']:'Label '+g['id'] for g in groups}
        previous=update_topics(items,projection(items),{},cache,labeler,grouper)
        original={p['url']:p['topicId'] for p in previous['points']}
        labels={t['id']:t['label'] for t in previous['topics']}
        for count in range(35,42):
            items.append({'url':f'https://example.com/{count-1}', 'embedding':[1,0.1], 'title':f'Paper {count-1}'})
            previous=update_topics(items,projection(items),previous,cache,labeler,grouper)
            self.assertEqual(len(previous['points']),count)
            self.assertTrue(all(p.get('topicId') for p in previous['points']))
            if count<40:
                self.assertEqual({t['id']:t['label'] for t in previous['topics']},labels)
                self.assertTrue(all(p['topicId']==original[p['url']] for p in previous['points'] if p['url'] in original))
                self.assertEqual(len(label_calls),1)
        self.assertEqual(fits,[34,40])
        self.assertEqual(len(label_calls),2)
        self.assertEqual(previous['clusteredCount'],40)

    def test_boundary_hook_is_not_lost_when_a_later_paper_is_already_saved(self):
        from topics import update_topics
        items=[{'url':f'https://example.com/{i}', 'embedding':[1,i+1], 'title':f'Paper {i}'} for i in range(41)]
        fits=[]
        def grouper(rows):
            fits.append(len(rows)); return [rows]
        def builder(rows,result,previous,cache):
            return update_topics(rows,result,previous,cache,lambda gs:{g['id']:'Group' for g in gs},grouper)
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'map.json'
            update_projection(items[:34],path,projection,builder,paper_count=34)
            update_projection(items,path,projection,builder,paper_count=39)
            self.assertEqual(fits,[34])
            update_projection(items,path,projection,builder,paper_count=40)
            self.assertEqual(fits,[34,41])
            self.assertFalse(update_projection(items,path,projection,builder,paper_count=41))


if __name__ == '__main__':
    unittest.main()
