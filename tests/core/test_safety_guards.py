"""Unit tests for RuleSafetyGuard.check() — all 24 rules."""

import pytest

from src.core.agent.safety_guards import RuleSafetyGuard


@pytest.fixture()
def guard():
    return RuleSafetyGuard()


ORIGINAL = "原始LLM回答"


class TestSafetyGuardRules:
    """Each test triggers exactly one rule and verifies the guard name + key content."""

    # Rule 1: consecutive_three_cohorts
    # Condition: ("连续三届" OR "三年") AND ("哪几届" OR "几届学生" OR "具体指")
    def test_consecutive_three_cohorts(self, guard):
        text, guards = guard.check("连续三届具体指哪几届学生", ORIGINAL)
        assert "consecutive_three_cohorts" in guards
        assert "2024届、2025届、2026届" in text

    # Rule 2: major_match_description
    # Condition: "专业匹配度说明" AND "符合计算机类专业毕业设计统一基准规范"
    def test_major_match_description(self, guard):
        _text, guards = guard.check("专业匹配度说明只写符合计算机类专业毕业设计统一基准规范可以吗", ORIGINAL)
        assert "major_match_description" in guards

    # Rule 3: development_document_outputs
    # Condition: "开发类" AND "文档成果"
    def test_development_document_outputs(self, guard):
        text, guards = guard.check("开发类选题需要提交哪些文档成果", ORIGINAL)
        assert "development_document_outputs" in guards
        assert "5000字" in text

    # Rule 4: development_main_outputs
    # Condition: "主要成果形式" AND "开发类"
    def test_development_main_outputs(self, guard):
        text, guards = guard.check("开发类选题主要成果形式怎么填", ORIGINAL)
        assert "development_main_outputs" in guards
        assert "30%" in text

    # Rule 5: advisor_student_limit
    # Condition: "每位指导教师" AND ("最多" OR "多少名" OR "指导多少")
    def test_advisor_student_limit(self, guard):
        text, guards = guard.check("每位指导教师最多指导多少名学生", ORIGINAL)
        assert "advisor_student_limit" in guards
        assert "8名" in text

    # Rule 6: official_start_week
    # Condition: "毕业设计" AND "正式启动" AND ("什么时候" OR "啥时候" OR "年月日" OR "12月22")
    def test_official_start_week(self, guard):
        text, guards = guard.check("毕业设计什么时候正式启动", ORIGINAL)
        assert "official_start_week" in guards
        assert "2025年12月22日" in text

    # Rule 7: source_code_comment_rate
    # Condition: "源代码注释率" AND ("多少"/"达到"/"合格"/"最低"/"阈值")
    #            AND NOT ("开题报告" OR "技术路线")
    def test_source_code_comment_rate(self, guard):
        text, guards = guard.check("源代码注释率最低要达到多少", ORIGINAL)
        assert "source_code_comment_rate" in guards
        assert "30%" in text

    def test_source_code_comment_rate_not_triggered_for_proposal(self, guard):
        """开题报告 + 技术路线 context should NOT trigger source_code_comment_rate."""
        _text, guards = guard.check("开题报告技术路线里源代码注释率达到多少", ORIGINAL)
        assert "source_code_comment_rate" not in guards

    # Rule 8: plagiarism_threshold_policy
    # Condition: ("查重率" OR "复制比") AND ("答辩"/"学校统一"/"统一规定"/"标准")
    def test_plagiarism_threshold_policy(self, guard):
        text, guards = guard.check("学校统一规定的查重率标准是多少才能答辩", ORIGINAL)
        assert "plagiarism_threshold_policy" in guards
        assert "30%" in text
        assert "40%" in text

    # Rule 9: student_topic_selection_timing
    # Condition: ("自己挑题目"/"开始选题"/"啥时候开始"/"什么时候开始")
    #            AND ("2026届"/"大四上"/"发题库"/"老师先发题"/"选题")
    def test_student_topic_selection_timing(self, guard):
        _text, guards = guard.check("2026届大四上什么时候开始选题", ORIGINAL)
        assert "student_topic_selection_timing" in guards

    # Rule 10: topic_pool_summary_deadline
    # Condition: "选题" AND ("题库"/"老师们的题目"/"汇总"/"公示")
    #            AND ("最晚"/"什么时候"/"时间点"/"文件规定")
    def test_topic_pool_summary_deadline(self, guard):
        _text, guards = guard.check("选题题库最晚什么时候汇总", ORIGINAL)
        assert "topic_pool_summary_deadline" in guards

    # Rule 11: reference_format_policy_file
    # Condition: "参考文献" AND ("校级文件"/"依据哪份"/"哪份文件"/"执行")
    def test_reference_format_policy_file(self, guard):
        text, guards = guard.check("参考文献标注格式依据哪份校级文件执行", ORIGINAL)
        assert "reference_format_policy_file" in guards
        assert "校教务〔2016〕10号" in text

    # Rule 12: proposal_route_comment_rate
    # Condition: "开题报告" AND "技术路线" AND "源代码注释率"
    def test_proposal_route_comment_rate(self, guard):
        _text, guards = guard.check("开题报告技术路线里需要写源代码注释率吗", ORIGINAL)
        assert "proposal_route_comment_rate" in guards

    # Rule 13: proposal_report_week
    # Condition: "开题报告" AND ("第几周"/"日期范围"/"哪几天"/"必须"/"提交")
    def test_proposal_report_week(self, guard):
        text, guards = guard.check("开题报告第几周提交", ORIGINAL)
        assert "proposal_report_week" in guards
        assert "2026年3月2日" in text

    # Rule 14: teacher_paper_material_before_proposal
    # Condition: "师生双选" AND "开题前" AND "纸质版材料"
    def test_teacher_paper_material_before_proposal(self, guard):
        _text, guards = guard.check("师生双选到开题前需要提交哪些纸质版材料", ORIGINAL)
        assert "teacher_paper_material_before_proposal" in guards

    # Rule 15: literature_review_midterm_same_week
    # Condition: "文献综述" AND ("中期检查" OR "中期检查表")
    def test_literature_review_midterm_same_week(self, guard):
        text, guards = guard.check("文献综述和中期检查表是同一周交吗", ORIGINAL)
        assert "literature_review_midterm_same_week" in guards
        assert "第六周" in text

    # Rule 16: proposal_to_midterm_interval
    # Condition: "开题完成" AND "中期检查" AND ("隔了几周"/"间隔"/"强制性节点")
    def test_proposal_to_midterm_interval(self, guard):
        text, guards = guard.check("开题完成到中期检查隔了几周有没有强制性节点", ORIGINAL)
        assert "proposal_to_midterm_interval" in guards
        assert "5周" in text

    # Rule 17: weekly_guidance_online
    # Condition: "每周不少于1次" AND ("线上"/"腾讯会议"/"出差"/"有效指导"/"过程成绩")
    def test_weekly_guidance_online(self, guard):
        _text, guards = guard.check("每周不少于1次指导用腾讯会议线上可以吗", ORIGINAL)
        assert "weekly_guidance_online" in guards

    # Rule 18: task_book_defined_by_org
    # Condition: "任务书作为" AND ("哪一级组织"/"明确界定"/"提交主体"/"提交时限"/"形式要求")
    def test_task_book_defined_by_org(self, guard):
        _text, guards = guard.check("任务书作为毕设文件由哪一级组织明确界定", ORIGINAL)
        assert "task_book_defined_by_org" in guards

    # Rule 19: task_meeting_interval
    # Condition: "任务书提交截止日" AND "师生见面"
    #            AND ("多少天"/"总共"/"自然日"/"教学日")
    def test_task_meeting_interval(self, guard):
        text, guards = guard.check("任务书提交截止日和师生见面启动日之间总共多少天自然日", ORIGINAL)
        assert "task_meeting_interval" in guards
        assert "19" in text

    # Rule 20: graduation_leave_date
    # Condition: ("离校前" OR "离校时间") AND ("最后一门考试" OR "1月15")
    def test_graduation_leave_date(self, guard):
        _text, guards = guard.check("离校前是否等于最后一门考试结束如1月15", ORIGINAL)
        assert "graduation_leave_date" in guards

    # Rule 21: task_paper_process_unknown
    # Condition: "任务书" AND ("往年"/"纸质"/"收件通知"/"教学办会在哪天"/
    #            "集中收"/"签字页"/"扫描件"/"签署顺序")
    def test_task_paper_process_unknown(self, guard):
        _text, guards = guard.check("任务书往年是纸质还是扫描件提交", ORIGINAL)
        assert "task_paper_process_unknown" in guards

    # Rule 22: task_submission_confirmation
    # Condition: "任务书" AND ("谁来确认"/"按时交"/"已接收"/"超期记录")
    def test_task_submission_confirmation(self, guard):
        _text, guards = guard.check("任务书谁来确认按时交了", ORIGINAL)
        assert "task_submission_confirmation" in guards

    # Rule 23: task_submission_system_closure
    # Condition: "任务书" AND "第十九周"
    #            AND ("自动"/"关掉"/"关闭"/"上传"/"不让传"/"周日白天"/"传完"/"不让")
    def test_task_submission_system_closure(self, guard):
        _text, guards = guard.check("任务书第十九周末系统会自动关掉上传入口吗", ORIGINAL)
        assert "task_submission_system_closure" in guards


class TestSafetyGuardPassthrough:
    """Queries that match no rule return original text unchanged."""

    def test_unrelated_query_passthrough(self, guard):
        text, guards = guard.check("今天天气怎么样", "今天是晴天")
        assert text == "今天是晴天"
        assert guards == []

    def test_partial_keyword_no_match(self, guard):
        """Only '连续三届' without the second required keyword group."""
        text, guards = guard.check("连续三届太难了", ORIGINAL)
        assert text == ORIGINAL
        assert guards == []
