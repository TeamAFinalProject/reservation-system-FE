import { useEffect, useState } from "react";

const INITIAL_STATE = {
    result: null,
    isLoading: true,
    errorMessage: "",
    errorStatus: null,
    errorCode: null,
};

// 비동기 조회 함수(loader)의 결과, 로딩, 에러 상태를 관리합니다. reload()로 다시 조회합니다.
export function useResource(loader, dependencies = []) {
    const [state, setState] = useState(INITIAL_STATE);
    const [reloadCount, setReloadCount] = useState(0);

    useEffect(() => {
        let isActive = true;
        Promise.resolve()
            .then(() => {
                if (isActive) {
                    setState(INITIAL_STATE);
                }
                return loader();
            })
            .then((result) => {
                if (isActive) {
                    setState({ ...INITIAL_STATE, result, isLoading: false });
                }
            })
            .catch((error) => {
                if (isActive) {
                    setState({
                        result: null,
                        isLoading: false,
                        errorMessage: error.message,
                        errorStatus: error.status ?? null,
                        errorCode: error.code ?? null,
                    });
                }
            });
        return () => {
            isActive = false;
        };
    }, [...dependencies, reloadCount]); // eslint-disable-line react-hooks/exhaustive-deps

    return { ...state, reload: () => setReloadCount((count) => count + 1) };
}
