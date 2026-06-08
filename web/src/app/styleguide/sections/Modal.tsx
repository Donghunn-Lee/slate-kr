import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Modal = () => (
  <section>
    <h2 className="mb-2 border-b border-subtle pb-3 text-lg font-semibold text-foreground">
      Modal
    </h2>
    <p className="mb-6 text-[13px] text-muted-foreground">
      파괴적 작업의 확정 대화상자(AlertDialog). 일반 Dialog는 추후 추가.
    </p>

    <div className="rounded-md border border-subtle bg-elevated p-6">
      <p className="mb-4 text-[13px] text-muted-foreground">
        예: 관심종목 그룹 삭제 — 그룹 내 종목이 다른 그룹에도 없는 경우 함께 제거되므로 확정 절차가 필요하다.
      </p>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            그룹 삭제
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>그룹 &ldquo;기술주&rdquo;를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              그룹에 속한 종목 중 다른 그룹에도 없는 종목은 관심종목에서 함께 제거됩니다.
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="mt-4 text-[11px] text-muted-foreground">
        확정 버튼은 default variant로 둔다 — destructive 토큰의 빨강이 price-up 색과 시각적으로 겹쳐서다.
      </p>
    </div>
  </section>
);
