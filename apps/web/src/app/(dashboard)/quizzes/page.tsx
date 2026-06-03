"use client";

import { useState } from "react";
import { 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  HelpCircle, 
  ArrowRight, 
  RotateCcw, 
  Award, 
  Cpu, 
  Shield, 
  Terminal 
} from "lucide-react";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";

interface DBQuestion {
  id: number;
  question: string;
  options: string[];
}

interface DBQuizMetadata {
  category: string;
  difficulty: string;
  xp: number;
  questions: DBQuestion[];
}

interface DBQuizNode {
  id: string;
  type: string;
  title: string;
  description: string;
  metadata: DBQuizMetadata;
}

interface ValidationResult {
  questionId: number;
  correct: boolean;
  correctIndex: number;
  explanation: string;
}

interface SubmitResponse {
  passed: boolean;
  score: number;
  total: number;
  results: ValidationResult[];
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  BASH: <Terminal className="text-blue-500" size={24} />,
  DOCKER: <Cpu className="text-cyan-500" size={24} />,
  NETWORKING: <Shield className="text-green-500" size={24} />,
};

export default function QuizzesPage() {
  const { user } = useAuth();
  const { data, error, isLoading, mutate } = useSWR<{ quizzes: DBQuizNode[] }>(
    "/api/content/quizzes",
    () => apiClient.get<{ quizzes: DBQuizNode[] }>("/api/content/quizzes")
  );

  const [activeQuiz, setActiveQuiz] = useState<DBQuizNode | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  
  // Track answers for all questions
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  
  // Validation results from the server
  const [validationResults, setValidationResults] = useState<Record<number, ValidationResult>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [finalScore, setFinalScore] = useState<{ score: number; total: number } | null>(null);

  const handleStartQuiz = (quiz: DBQuizNode) => {
    setActiveQuiz(quiz);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setUserAnswers({});
    setValidationResults({});
    setIsAnswerSubmitted(false);
    setQuizCompleted(false);
    setFinalScore(null);
  };

  const handleSelectOption = (index: number) => {
    if (isAnswerSubmitted) return;
    setSelectedOption(index);
  };

  const handleSubmitAnswer = async () => {
    if (selectedOption === null || isAnswerSubmitted || !activeQuiz || !user) return;

    const quiz = activeQuiz;
    const currentUser = user;

    setIsValidating(true);
    const updatedAnswers = { ...userAnswers, [quiz!.metadata.questions[currentQuestionIndex]!.id]: selectedOption };
    setUserAnswers(updatedAnswers);

    try {
      // Validate this specific answer by submitting the running state
      const data = await apiClient.post<SubmitResponse>(`/api/content/quizzes/${quiz.id}/submit`, {
        userId: currentUser.id,
        answers: updatedAnswers,
      });
      
      // Store result for current question
      const currentQId = quiz!.metadata.questions[currentQuestionIndex]!.id;
      const currentResult = data.results.find(r => r.questionId === currentQId);
      if (currentResult) {
        setValidationResults(prev => ({ ...prev, [currentQId]: currentResult }));
      }
      setIsAnswerSubmitted(true);

      // If it's the final question, save the total score
      if (currentQuestionIndex + 1 === quiz.metadata.questions.length) {
        setFinalScore({ score: data.score, total: data.total });
      }
    } catch (err) {
      console.error("Failed to submit answer:", err);
    } finally {
      setIsValidating(false);
    }
  };

  const handleNextQuestion = () => {
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    
    if (currentQuestionIndex + 1 < activeQuiz!.metadata.questions.length) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      setQuizCompleted(true);
      // Trigger a re-fetch of learning path progress / frontier
      mutate();
    }
  };

  const handleRestartQuiz = () => {
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setUserAnswers({});
    setValidationResults({});
    setIsAnswerSubmitted(false);
    setQuizCompleted(false);
    setFinalScore(null);
  };

  const handleBackToList = () => {
    setActiveQuiz(null);
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-black">Loading quizzes...</div>;
  }

  if (error || !data) {
    return (
      <div className="border border-neutral-200 p-4 text-sm text-red-500 rounded-lg">
        Failed to load quizzes. Please check database connections.
      </div>
    );
  }

  const quizzes = data.quizzes;

  if (activeQuiz) {
    const question = activeQuiz!.metadata.questions[currentQuestionIndex]!;
    const completedProgressPercent = ((currentQuestionIndex + (isAnswerSubmitted ? 1 : 0)) / activeQuiz.metadata.questions.length) * 100;
    const currentQuestionResult = validationResults[question.id];

    return (
      <div className="flex flex-col gap-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleBackToList} 
              className="border border-neutral-300 bg-white text-xs px-3 py-1.5 rounded-md hover:bg-neutral-50 transition-colors cursor-pointer text-black font-semibold"
            >
              ← Exit Quiz
            </button>
            <div>
              <h2 className="text-lg font-bold text-black">{activeQuiz.title}</h2>
              <p className="text-[10px] text-neutral-600 font-mono">
                Category: {activeQuiz.metadata.category} | Reward: +{activeQuiz.metadata.xp} XP
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-neutral-700 bg-neutral-100 px-2.5 py-1 rounded-md">
            Question {currentQuestionIndex + 1} of {activeQuiz.metadata.questions.length}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-black h-full transition-all duration-300"
            style={{ width: `${completedProgressPercent}%` }}
          />
        </div>

        {!quizCompleted ? (
          <div className="flex flex-col gap-6">
            {/* Question Card */}
            <div className="border border-neutral-200 p-6 rounded-lg bg-neutral-50/50">
              <h3 className="text-md font-bold text-black leading-snug">
                {question.question}
              </h3>
            </div>

            {/* Options List */}
            <div className="flex flex-col gap-3">
              {question.options.map((option, idx) => {
                let borderClass = "border-neutral-200 hover:border-black bg-white";
                let icon = <HelpCircle size={16} className="text-neutral-400" />;

                if (selectedOption === idx) {
                  borderClass = "border-black bg-neutral-50 ring-1 ring-black";
                  icon = <HelpCircle size={16} className="text-black" />;
                }

                if (isAnswerSubmitted && currentQuestionResult) {
                  if (idx === currentQuestionResult.correctIndex) {
                    borderClass = "border-green-600 bg-green-50/50 text-green-950 font-semibold ring-1 ring-green-600";
                    icon = <CheckCircle size={16} className="text-green-600" />;
                  } else if (selectedOption === idx) {
                    borderClass = "border-red-600 bg-red-50/50 text-red-950 ring-1 ring-red-600";
                    icon = <XCircle size={16} className="text-red-600" />;
                  } else {
                    borderClass = "border-neutral-200 bg-white opacity-50";
                  }
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectOption(idx)}
                    disabled={isAnswerSubmitted || isValidating}
                    className={`border p-4 rounded-lg flex items-center justify-between text-left text-sm transition-all duration-200 cursor-pointer text-black ${borderClass}`}
                  >
                    <span>{option}</span>
                    {icon}
                  </button>
                );
              })}
            </div>

            {/* Explanation box */}
            {isAnswerSubmitted && currentQuestionResult && (
              <div className="border border-neutral-200 bg-neutral-50 p-4 rounded-lg text-xs leading-relaxed text-black">
                <p className="font-bold text-neutral-800 mb-1">
                  {currentQuestionResult.correct ? "✅ Correct!" : "❌ Incorrect"}
                </p>
                <p className="text-neutral-700">{currentQuestionResult.explanation}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end pt-2 border-t border-neutral-200">
              {!isAnswerSubmitted ? (
                <button
                  onClick={handleSubmitAnswer}
                  disabled={selectedOption === null || isValidating}
                  className="bg-black text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm px-6 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isValidating ? "Validating..." : "Submit Answer"}
                </button>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  className="bg-black text-white hover:bg-neutral-800 font-semibold text-sm px-6 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {currentQuestionIndex + 1 === activeQuiz.metadata.questions.length ? "Finish Quiz" : "Next Question"}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Completion Screen */
          <div className="border border-neutral-200 p-8 rounded-xl bg-white text-center flex flex-col items-center gap-6 shadow-sm animate-fade-in">
            <div className="p-4 bg-yellow-50 rounded-full text-yellow-600">
              <Award size={48} />
            </div>

            <div className="flex flex-col gap-1.5">
              <h3 className="text-xl font-bold text-black">Quiz Completed!</h3>
              {finalScore && (
                <p className="text-sm text-neutral-600">
                  You scored <strong className="text-black">{finalScore.score} / {finalScore.total}</strong> correct answers.
                </p>
              )}
            </div>

            {finalScore && (
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm mt-2">
                <div className="border border-neutral-200 p-3 rounded-lg bg-neutral-50">
                  <span className="text-[10px] text-neutral-500 block font-semibold">XP Earned</span>
                  <span className="text-lg font-bold text-black">
                    +{Math.round((finalScore.score / finalScore.total) * activeQuiz.metadata.xp)} XP
                  </span>
                </div>
                <div className="border border-neutral-200 p-3 rounded-lg bg-neutral-50">
                  <span className="text-[10px] text-neutral-500 block font-semibold">Accuracy</span>
                  <span className="text-lg font-bold text-black">
                    {Math.round((finalScore.score / finalScore.total) * 100)}%
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 w-full max-w-sm mt-4">
              <button
                onClick={handleRestartQuiz}
                className="flex-1 border border-neutral-300 text-black hover:bg-neutral-50 font-semibold text-sm py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-white"
              >
                <RotateCcw size={16} />
                Replay
              </button>
              <button
                onClick={handleBackToList}
                className="flex-1 bg-black text-white hover:bg-neutral-800 font-semibold text-sm py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                All Quizzes
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 border-b border-neutral-200 pb-4">
        <h1 className="text-xl font-bold text-black">Interactive DevOps Quizzes</h1>
        <p className="text-xs text-neutral-600 font-medium">Challenge yourself and test your infrastructure, DevOps, and administration concepts.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {quizzes.map((quiz) => (
          <div 
            key={quiz.id} 
            className="border border-neutral-200 rounded-xl p-5 flex flex-col justify-between hover:shadow-md hover:border-neutral-300 transition-all duration-200 bg-white"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="p-2.5 bg-neutral-50 rounded-lg border border-neutral-100">
                  {CATEGORY_ICONS[quiz.metadata.category] || <BookOpen size={24} className="text-neutral-500" />}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="border border-neutral-200 bg-neutral-50 px-2 py-0.5 rounded text-[10px] font-semibold text-neutral-700">
                    {quiz.metadata.difficulty}
                  </span>
                  <span className="text-[10px] font-bold text-neutral-500 font-mono">
                    +{quiz.metadata.xp} XP
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="font-bold text-md text-black">{quiz.title}</h3>
                <p className="text-xs text-neutral-600 leading-relaxed line-clamp-3">
                  {quiz.description}
                </p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-neutral-500 font-medium">
                <BookOpen size={14} />
                {quiz.metadata.questions.length} questions
              </span>
              <button 
                onClick={() => handleStartQuiz(quiz)}
                className="bg-black hover:bg-neutral-800 text-white font-semibold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                Start Quiz
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
